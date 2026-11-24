# 账号保存与恢复

多账号 Cookie 和资料保存在应用沙箱的 `auth-storage.json` 及 `auth-storage.json.backup`。两个文件使用 AES-256-GCM 加密，密钥单独保存在 SecureStore；iOS 使用首次解锁后可访问、仅本设备的 Keychain 属性。密钥不进入 JSON、日志、fixture 或截图。文件外层格式为 `zhihu-auth-aes-gcm` v1，解密后的 Zustand 格式仍是 v2。

## 迁移与原子文件

首次读取支持旧明文 v0/v1/v2，并保留原有多账号资料与活动账号语义。迁移先生成并确认 SecureStore 密钥，再写入加密备份和主文件；成功后两个文件都是当前快照。密钥或保存暂时失败时，原明文仍可读取，自动写入暂停；不会先删除旧文件。只有两个文件确实均不存在才允许首次导入旧 SecureStore Cookie。存在但无法读取的文件不允许导入旧 Cookie，也不允许空状态覆盖。

`modules/zhihu-persistence` 提供平台原子读写：iOS 使用同目录原子替换及首次解锁后文件保护；Android 使用 `AtomicFile`，读取必须经过 `openRead`，恢复旧系统中断写入留下的 `.bak`。JS 的读取、迁移、恢复、保存及显式重置串行执行，原生读写上限为 16 MiB。未重建的旧开发包缺少该模块时会停止保存并显示更新提示，不能回退到直接写原文件。

主文件有效时以它为准；主文件损坏时尝试当前备份并修复主文件。保存先写备份再原子提交主文件，然后读回校验。成功保存后备份与主文件对应同一当前会话，避免退出后从旧备份恢复登录；主文件提交前中断则视为操作未完成，原完整主文件仍可使用。这里没有承诺设备损坏、系统恢复或任意物理断电下的跨文件事务。

## 失败反馈

首次恢复成功前禁止新增、切换和删除账号，避免启动时的新登录覆盖尚未读取的既有账号。后续异步恢复按会话版本校验，不能覆盖期间选定的新会话。登录会等待保存结果，失败时留在登录页并提供重试；取消或离开登录页后不再应用迟到的 Cookie/资料回调或成功跳转。退出、切换和删除账号失败时会说明重启可能恢复旧状态，并提供重试；“我的”页在持久化失败时提供保存与恢复入口。读取失败后的重试先恢复并重新 hydrate 账号，不能把尚未恢复的默认游客状态写入磁盘。

恢复后的账号与会话版本在同一次状态合并中生效，页面收到已恢复账号时即可使用对应版本发起请求。不要在 hydration 完成回调中再推进版本，否则 iOS 和 Android 冷启动时的首页请求可能被误判为旧会话而丢弃。同一账号快照的重复恢复不会推进版本；真正切换账号后仍拒绝旧请求。

切换账号或进入游客模式时立即登记原生 Cookie 同步，不等待文件持久化结束才清理旧会话。游客初始化和 API 原生 Cookie 读取等待已经登记的同步完成，再使用匿名 Cookie；带有 `z_c0` 的旧原生会话不能用来初始化游客 WebView。这样清理旧账号不会在游客初始化后再次删掉刚取得的匿名 Cookie。同一次原生同步共享最多 5 秒等待预算，失败或超时后跳过原生 Cookie 读取和游客 WebView，以无 Cookie 请求继续，避免原生清理挂起时请求卡在 Axios 传输超时之前。同步失败结果保留到下一次同步成功，首次安装允许旧账号迁移时也不能读取清理失败的原生 Cookie；发起同步的页面仍接收原始错误并提示用户。

“清除本地账号”需要用户在应用中明确确认；只有此路径可以删除密钥并写入空快照。密钥重置与其他保存共用串行边界，旧会话的 API/原生 Cookie 同步在会话变化后停止。正常的网络错误、文件损坏或启动失败都不会自动清除本地账号。

账号文件与 SecureStore 密钥必须同时可用。仅复制 JSON 到其他设备不能恢复账号；卸载、换机及系统备份恢复不保证登录态可迁移。遇到不可恢复的密钥丢失时，应由用户确认清除并重新登录。

## 旧版 Android 的解密长度

Android 8 的 AES-GCM 实现可把认证标签计入解密缓冲区的容量上界。Expo Crypto 58.0.7 将整个缓冲区交给 JS，未写入的字节会出现在账号 JSON 末尾，导致首次保存的读回校验和后续冷启动解析失败。[Android Cipher 文档](https://developer.android.com/reference/javax/crypto/Cipher#getOutputSize(int))

项目的 [Expo Crypto 补丁](../patches/expo-crypto+58.0.7.patch) 按 `Cipher.doFinal` 返回的有效字节数交付明文，保留原始数据中的零字节。旧版写入的有效密文可使用已有密钥直接恢复。`package.json` 的 Android `buildFromSource` 配置确保原生构建使用补丁源码。修改补丁或升级 Expo Crypto 后要重新构建 APK，在旧设备上验证保存和恢复。

三星 SM-P583（Android 8.1，API 27，armeabi-v7a）的独立 DEX 探针使用系统 AndroidOpenSSL，对照旧实现的整块缓冲区与修补后的 Expo `CipherExtensions.kt`。58 字节的合成 UTF-8 JSON、空明文和 5 字节的含尾零数据，旧路径分别返回 74、16、21 字节，修补后分别返回 58、0、5 字节，三组篡改密文均被拒绝。探针使用测试用的 `SealedData` 容器。

同一台平板上，用独立包名安装的 v0.10.1 基线能保存 SecureStore 密钥并写入合成密文，但重启后无法准确读回。原地覆盖安装修复包后，首次启动及再次强制停止后的冷启动均使用原密钥完整读回了同一份密文。修复包也通过了合成账号保存、旧明文迁移、损坏主文件的备份恢复及退出后保持登出检查。

设备持有人随后在修复包中完成了实际登录。强制停止应用后再打开，“我的”页恢复了已登录的个人主页入口，从推荐页进入回答详情也成功。

## 验证

```bash
npm test -- tests/encryptedAuthStorage.test.ts tests/authPersistenceQueue.test.ts tests/apiClientSession.test.ts tests/loginPersistence.test.tsx tests/nativeSessionSync.test.ts --runInBand
```

测试使用合成账号及临时密钥，覆盖旧格式迁移、密文篡改、损坏恢复、Android 原子读取合同、保存中断、并发、冷启动账号恢复时的请求会话一致性与退出后不恢复旧登录。Android 合同测试模拟 `AtomicFile` 行为，不冒充 Android 系统实现的实际运行。

开发包可通过 `zhihu--:///dev/native-validation` 检查原生 AES、SecureStore、文件和哈希。只读取该页产生的 `native-validation-result.json`（时间戳和布尔结果）；不要导出真实账号文件、密钥或原生 Cookie。生产包会重定向所有 `/dev/*` 页面。
