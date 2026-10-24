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

## Android 8 解密兼容

Android 8.0/8.1 的系统 Conscrypt 在 AES-GCM 解密时，`Cipher.getOutputSize` 返回的容量上界包含认证标签；`doFinal` 返回的才是实际明文长度。Expo Crypto 原实现直接返回整个缓冲数组，可能在账号 JSON 后追加 16 个零字节，导致保存后的读回校验及下次启动恢复失败。此问题与 32/64 位无关；它在升级前使用的 Expo Crypto 55.0.19 中也已存在，不能据此单独认定为 SDK 58 引入的回归。

版本边界按 AOSP 各版本首发源码核对：[Android 9](https://android.googlesource.com/platform/external/conscrypt/+/android-9.0.0_r1/common/src/main/java/org/conscrypt/OpenSSLCipher.java) 仍有相同的容量上界；[Android 10](https://android.googlesource.com/platform/external/conscrypt/+/android-10.0.0_r1/common/src/main/java/org/conscrypt/OpenSSLCipher.java) 的 AES.GCM 子类已按标签长度计算精确明文长度，Android 11–16 的 `OpenSSLAeadCipherAES` 也沿用精确计算。因此这个特定缺陷也可能影响 Android 9，标准 Android 10–16 实现不会因该计算产生尾零；厂商 ROM 或其他加密 provider 仍需实测，这不代表整个应用在这些系统上均已通过验证。

[`expo-crypto` 补丁](../patches/expo-crypto+58.0.7.patch) 按 `doFinal` 的实际写入长度返回明文，保留合法尾零与 GCM 认证，不改变密文格式、密钥或迁移规则。已写入的有效密文可由修复后的实现直接读取，无需清除账号。`package.json` 对 Android 的 `expo-crypto` 指定 `buildFromSource`，确保补丁进入原生包；默认预编译 AAR 不会采用修改后的 Kotlin。必须重新 prebuild 并构建 APK，JS 热更新不能使补丁生效。

本应用生产代码仅账号保存与恢复使用这条 Expo AES 链路，因此直接影响新登录、多账号切换/删除/退出的持久化和冷启动恢复。主题、设置、搜索与 telemetry 偏好直接使用 SecureStore；草稿和 Feed 缓存使用 SQLite，不经过此函数。它们不属于这个补丁所修复问题的直接范围，但其他升级回归仍需分别验证。

首次无账号文件时，恢复流程可以完成，登录也会先更新内存；随后写入有效密文却在读回校验时失败，本次运行仍可能使用内存中的账号。重启或升级后，已有文件无法通过解密后的 JSON 校验，恢复保护会阻止新登录覆盖旧账号。这能解释“旧版只提示保存异常、升级重启后无法登录”的表现差异，但仍需在实际故障设备上确认，不应据此自动清除账号或绕过恢复保护。

## 验证

```bash
npm test -- tests/encryptedAuthStorage.test.ts tests/authPersistenceQueue.test.ts tests/apiClientSession.test.ts tests/loginPersistence.test.tsx tests/nativeSessionSync.test.ts --runInBand
bash scripts/test-android-auth-crypto.sh
```

测试使用合成账号及临时密钥，覆盖旧格式迁移、密文篡改、损坏恢复、Android 原子读取合同、保存中断、并发、冷启动账号恢复时的请求会话一致性与退出后不恢复旧登录。Android 合同测试模拟 `AtomicFile` 行为，不冒充 Android 系统实现的实际运行。

AES 原生回归脚本需要 JDK 17+、Node.js 和 `kotlinc` 或已缓存的 Kotlin 编译器，直接编译安装包中的 `CipherExtensions.kt`；用真实 JVM AES-GCM 和 Android 8 的输出容量合同验证 Unicode、空明文、合法零字节、篡改及错误 AAD 拒绝，再以真实 JSON 解析检查账号快照。它不替代 Android 8/8.1、armeabi-v7a 的 Keystore、Expo 桥接与重启恢复实机验证。

开发包可通过 `zhihu--:///dev/native-validation` 检查原生 AES、SecureStore、文件和哈希。只读取该页产生的 `native-validation-result.json`（时间戳和布尔结果）；不要导出真实账号文件、密钥或原生 Cookie。生产包会重定向所有 `/dev/*` 页面。
