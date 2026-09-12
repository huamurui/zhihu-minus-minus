# Windows + Android 模拟器第三方 App 抓包指南

> **环境：LDPlayer 9 + Root + mitmproxy / mitmweb**  
> 整理日期：2026-09-11  
> 适用于自己设备上的调试、研究与授权测试。

> [!NOTE]
> 本文覆盖代理配置、CA 证书、Android 系统证书、请求筛选与常见故障定位。  
> 如果目标 App 使用了 certificate pinning、自定义 TLS 或其他主动安全保护，本文不包含绕过这些保护的方法。

---

## 1. 最终可用架构

这次实际跑通的组合是：

```text
Windows
├─ mitmweb :8080
└─ LDPlayer 9
   ├─ ARM64 App
   ├─ Root
   ├─ ADB
   ├─ System Disk = Writable
   └─ Android 系统 CA 信任 mitmproxy
```

大致流程：

```text
目标 App
   ↓
LDPlayer Android 系统代理
   ↓
Windows IPv4 : 8080
   ↓
mitmweb
   ↓
目标服务器
```

关键点有两个：

1. **目标 APK 只有 `arm64-v8a`**，所以普通 Android Studio x86_64 AOSP 模拟器并不合适。
2. 第三方 App 往往**不信任用户安装的 CA**，因此需要把 mitmproxy CA 放入 Android 的**系统证书仓库**。

---

## 2. 为什么选 LDPlayer 9

最初考虑过 Android Studio AOSP x86_64，因为 AOSP 模拟器的 Root、ADB 和调试链路很干净。

但是目标 APK 只有 ARM64 原生库：

```text
arm64-v8a
```

因此普通 x86_64 AOSP 不是合适的运行环境。

| 环境 | 优点 | 本次结论 |
|---|---|---|
| Android Studio AOSP x86_64 | Root、ADB、调试链路干净 | 目标 App 仅 ARM64，放弃 |
| LDPlayer 9 | 支持 ARM App / ARM 转译，Root 与 ADB 方便 | **本次主力方案** |
| ARM64 真机 | 最接近真实设备 | 也可行，但需要合适的 Root / 调试环境 |

---

## 3. 先确认 APK ABI

APK 本质上是 ZIP，可以直接检查 `lib/` 目录。

例如使用 7-Zip：

```powershell
7z l app.apk | findstr /i "lib/"
```

常见 ABI：

```text
arm64-v8a
armeabi-v7a
x86
x86_64
```

如果只看到：

```text
lib/arm64-v8a/
```

那么在 x86_64 Android 模拟器中运行时，通常需要依赖模拟器厂商提供的 ARM 转译能力。

---

## 4. 准备 LDPlayer

先确认目标 App 可以在雷电中：

- 正常安装；
- 正常启动；
- 在没有代理的情况下正常联网。

然后在 LDPlayer 设置中开启：

- **Root permission / Root 权限**
- **ADB 调试**
- **System Disk / 系统磁盘：Writable / 可写**

其中最后一项很重要。

如果之后出现：

```text
remount of the / superblock failed: Permission denied
remount failed
```

通常不是 `su` 没成功，而是 system 分区仍然只读。

修改为 **Writable** 后需要**完整重启模拟器实例**。

---

## 5. 确认 ADB 与 Root

进入雷电安装目录，例如：

```powershell
cd C:\LDPlayer\LDPlayer9
```

检查设备：

```powershell
.\adb.exe devices
```

本次实际设备：

```text
List of devices attached
emulator-5554   device
```

进入 Android shell：

```powershell
.\adb.exe shell
```

取得 Root：

```sh
su
id
```

成功时应看到类似：

```text
uid=0(root) gid=0(root) groups=0(root) context=u:r:su:s0
```

这说明 Root 本身已经正常。

---

## 6. Windows 启动 mitmweb

在 Windows 安装 mitmproxy 后，启动：

```powershell
mitmweb --listen-host 0.0.0.0 --listen-port 8080
```

这里：

- `0.0.0.0`：允许模拟器从宿主机外部接口访问；
- `8080`：代理监听端口。

然后执行：

```powershell
ipconfig
```

找到 Windows 当前网络接口的 IPv4 地址，例如：

```text
192.168.1.123
```

---

## 7. 配置 LDPlayer HTTP 代理

在 Android / LDPlayer 中，把当前网络的 HTTP 代理设置为：

```text
代理主机：Windows IPv4
代理端口：8080
```

例如：

```text
192.168.1.123:8080
```

不要填：

```text
127.0.0.1
```

因为模拟器里的 `127.0.0.1` 指的是模拟器自身，而不是 Windows 宿主机。

如果之后 `mitm.it` 完全打不开，优先检查：

1. Windows IPv4 是否填对；
2. `mitmweb` 是否正在监听 `0.0.0.0:8080`；
3. Windows Defender 防火墙是否拦截 8080；
4. 模拟器代理是否真的保存成功。

---

## 8. 安装 mitmproxy 用户 CA

在 LDPlayer 浏览器里访问：

```text
http://mitm.it
```

下载 Android CA 并安装。

安装后先不要急着测试目标 App，而是先用浏览器访问一个 HTTPS 网站。

理想状态：

- HTTPS 页面能正常打开；
- mitmweb 能看到完整 URL；
- 能查看 Headers；
- 能查看 Request Body；
- 能查看 Response；
- 不只是看到 CONNECT / TLS 隧道。

如果浏览器已经能正常抓包，说明：

```text
LDPlayer → Windows 代理 → mitmweb
```

这一整条链路已经通了。

---

## 9. 为什么浏览器能抓，App 却报“网络连接错误”

这是很常见的情况。

浏览器可能信任用户手动安装的 CA，但较新的 Android App 默认通常**不会信任用户 CA**。

因此：

```text
浏览器正常
+
App 网络错误
```

并不意味着代理坏了。

下一步需要让 mitmproxy CA 成为 Android 的**系统 CA**。

---

## 10. 找到 Android 用户 CA 文件

进入 Root shell：

```powershell
.\adb.exe shell
```

然后：

```sh
su
ls -l /data/misc/user/0/cacerts-added/
```

本次实际看到：

```text
-rw-r--r-- 1 system system 825 ... c8750f0d.0
```

因此本次 mitmproxy CA 对应的文件为：

```text
c8750f0d.0
```

一般形式是：

```text
<hash>.0
```

后续需要把这个文件复制到：

```text
/system/etc/security/cacerts/
```

> `c8750f0d.0` 是这次环境里的实际文件名。  
> 换一台机器或重新生成证书后，hash 可能不同，应以实际目录内容为准。

---

## 11. 让 system 分区可写

先退出 shell：

```sh
exit
exit
```

然后在 PowerShell 中执行：

```powershell
.\adb.exe root
.\adb.exe remount
```

### 本次遇到的问题

最开始得到：

```text
remount of the / superblock failed: Permission denied
remount failed
```

即使：

```sh
su
id
```

已经显示：

```text
uid=0(root)
```

仍然无法 remount。

### 原因

LDPlayer 的 **System Disk 仍是只读状态**。

### 解决方法

在 LDPlayer 设置中：

```text
System Disk → Writable
```

然后**完整重启模拟器**。

再次执行：

```powershell
.\adb.exe root
.\adb.exe remount
```

成功后再继续。

---

## 12. 把 mitmproxy CA 放入 Android 系统证书仓库

`adb remount` 成功后：

```powershell
.\adb.exe shell
```

进入 Root：

```sh
su
```

复制证书：

```sh
cp /data/misc/user/0/cacerts-added/c8750f0d.0 \
  /system/etc/security/cacerts/c8750f0d.0
```

设置权限：

```sh
chmod 644 /system/etc/security/cacerts/c8750f0d.0
```

设置属主：

```sh
chown root:root /system/etc/security/cacerts/c8750f0d.0
```

检查：

```sh
ls -l /system/etc/security/cacerts/c8750f0d.0
```

确认文件存在后重启：

```sh
reboot
```

---

## 13. 重启后验证系统 CA

模拟器重启后，可以再次检查：

```powershell
.\adb.exe shell
```

```sh
su
ls -l /system/etc/security/cacerts/c8750f0d.0
```

也可以在 Android 设置中的：

```text
受信任的凭据
→ 系统
```

检查 mitmproxy CA 是否已被加载为系统证书。

---

## 14. 验证抓包是否真正成功

推荐严格按顺序验证，这样出问题时比较容易知道是哪一层：

1. 浏览器 HTTPS 能正常打开；
2. mitmweb 能看到浏览器的完整 HTTPS 请求；
3. mitmweb 能读取 Headers / Body / Response；
4. 系统 CA 中存在 mitmproxy；
5. 强制停止目标 App；
6. 重新打开 App；
7. App 恢复联网；
8. mitmweb 开始出现目标 App 的业务请求。

强制停止 App：

```powershell
.\adb.exe shell am force-stop <package.name>
```

然后重新打开目标 App。

如果这时 App 不再报网络错误，同时 mitmweb 中开始出现业务 API，请求抓取就基本跑通了。

---

## 15. mitmweb 请求太多时怎么过滤

真正抓到流量以后，问题通常会从：

> “为什么抓不到？”

变成：

> “怎么这么多？”

mitmweb 顶部过滤框支持组合过滤表达式。

### 常用过滤表达式

| 表达式 | 用途 |
|---|---|
| `~d zhihu.com` | 只看域名包含 `zhihu.com` 的请求 |
| `~m GET` | 只看 GET |
| `~m POST` | 只看 POST |
| `~u /api/` | URL 中包含 `/api/` |
| `!~d google` | 排除 Google 域名 |
| `~d zhihu.com & ~m POST` | 只看知乎域名中的 POST |
| `~d zhihu.com & ~u answer` | 知乎域名且 URL 包含 `answer` |
| `~d zhihu.com & !~u analytics & !~u log` | 排除部分埋点 / 日志请求 |

组合过滤往往比单纯按列表排序有效得多。

---

## 16. 最有效的方法：把“用户行为”和“请求”关联起来

过滤表达式只能减少噪声。

真正定位业务 API 时，最有效的方法是**控制变量**。

例如想找“展开评论”的接口：

1. 在 mitmweb 中清空现有流量；
2. 切回 App；
3. 只做一次“展开评论”；
4. 立即切回 mitmweb；
5. 只检查刚刚新增的请求。

优先观察：

- HTTP 状态码为 `200`；
- `Content-Type` 为 JSON；
- URL 看起来像业务 API；
- Response 中出现刚才页面里的文本 / ID / 用户信息；
- Query 或 Body 中出现当前对象的 ID。

常见业务关键词：

```text
feed
recommend
question
answer
comment
member
people
profile
search
cursor
offset
limit
```

这些只适合辅助检索。

具体接口路径会随 App 版本变化，不要假定某个 API 名称永远固定。

---

## 17. 一个比较实用的抓接口流程

例如想确认“下拉刷新首页”对应哪些接口：

```text
1. mitmweb 清空流量
2. App 停在首页
3. 执行一次下拉刷新
4. 回 mitmweb
5. 先按目标域名过滤
6. 排除 analytics / log 等明显噪声
7. 优先看返回 JSON 的 200 请求
8. 对照 Response 中的数据与 UI 内容
9. 再检查请求参数、分页 cursor、limit 等
```

不要一开始就在几百条请求里盲找。

**单动作 → 单批请求** 的定位效率高得多。

---

## 18. 常见故障排查

| 现象 | 优先判断 |
|---|---|
| `mitm.it` 都打不开 | 模拟器没有真正连到 Windows 代理；检查 IP、8080 监听、防火墙 |
| 浏览器能抓，App 报网络连接错误 | 优先怀疑 App 不信任用户 CA；确认系统 CA |
| `adb root` 成功，但 `adb remount` Permission denied | LDPlayer System Disk 仍然只读；改成 Writable 后重启 |
| 系统 CA 已安装，浏览器正常，但 App 仍失败 | 可能存在自定义信任链、certificate pinning、自定义 TLS、QUIC/HTTP3 或绕过系统代理 |
| mitmweb 完全看不到目标 App 请求 | App 可能未走系统 HTTP 代理，或者使用了其他传输方式 |
| mitmweb 能看到连接，但 TLS handshake failed | 请求已经到代理，但 TLS 信任或应用层校验仍拒绝 MITM |

---

## 19. 使用 logcat 辅助判断 TLS 问题

如果系统 CA 已经成功安装，但 App 仍然网络错误，可以先清空日志：

```powershell
.\adb.exe logcat -c
```

然后只看 TLS / SSL / 网络库相关内容：

```powershell
.\adb.exe logcat | findstr /i "ssl tls certificate handshake okhttp cronet conscrypt"
```

再回到 App 触发一次请求。

可以结合 mitmweb 判断：

### 情况 A：mitmweb 完全没有连接

更像是：

```text
App 没走系统代理
```

或者：

```text
使用了其他网络传输路径
```

### 情况 B：mitmweb 能看到连接，但握手失败

更像是：

```text
流量到达 mitmproxy
→ TLS / 证书信任失败
```

这样就不用继续盲目修改代理设置。

---

## 20. 抓到请求以后重点看什么

在 mitmweb 点开一条请求后，一般优先看：

### URL

```text
https://api.example.com/xxx
```

判断大概是什么业务。

### Method

```text
GET
POST
PUT
DELETE
```

### Query

例如：

```text
?limit=20&offset=0
```

或者：

```text
?cursor=xxxx
```

分页接口通常很好识别。

### Request Headers

关注：

```text
Authorization
Cookie
Content-Type
User-Agent
Referer
```

以及 App 自己定义的 Header。

### Request Body

POST / PUT 请求尤其重要。

常见：

```json
{
  "id": "...",
  "cursor": "...",
  "limit": 20
}
```

### Response

最关键。

如果返回 JSON，可以直接通过字段和 UI 内容建立对应关系。

---

## 21. 安全与收尾

把 mitmproxy CA 放进系统证书仓库之后，这个 LDPlayer 实例应当视作一个**专用调试环境**。

不建议在里面登录：

- 银行账户；
- 主邮箱；
- 密码管理器；
- 其他高价值账号。

测试结束后可以：

1. 取消 Android HTTP 代理；
2. 删除系统中的 mitmproxy CA；
3. 或者直接删除这个模拟器实例。

如果以后还经常需要抓包，也可以保留一个专门的、隔离的 LDPlayer 调试实例。

---

## 22. 最短复现清单

以后重新搭环境，大致只需要记住下面这些：

1. 确认 APK ABI；如果只有 `arm64-v8a`，选择能运行 ARM App 的环境。
2. 安装 LDPlayer 9，确认目标 App 能正常启动。
3. 开启 Root 和 ADB。
4. 将 **System Disk 设置为 Writable**，重启。
5. Windows 启动：

   ```powershell
   mitmweb --listen-host 0.0.0.0 --listen-port 8080
   ```

6. LDPlayer HTTP 代理指向：

   ```text
   Windows IPv4:8080
   ```

7. 浏览器打开：

   ```text
   http://mitm.it
   ```

8. 安装 Android 用户 CA。
9. 用浏览器验证 HTTPS 抓包。
10. Root 后找到：

    ```text
    /data/misc/user/0/cacerts-added/<hash>.0
    ```

11. 执行：

    ```powershell
    .\adb.exe root
    .\adb.exe remount
    ```

12. 把 CA 复制到：

    ```text
    /system/etc/security/cacerts/<hash>.0
    ```

13. 设置：

    ```sh
    chmod 644 /system/etc/security/cacerts/<hash>.0
    chown root:root /system/etc/security/cacerts/<hash>.0
    ```

14. 重启 Android。
15. 强制停止并重新打开目标 App。
16. mitmweb 按 **域名 / Method / URL** 过滤。
17. 清空流量后，一次只做一个 App 动作，用行为与请求建立对应关系。

---

## 23. 本次实际用到的关键命令速查

### ADB / Root

```powershell
cd C:\LDPlayer\LDPlayer9

.\adb.exe devices
.\adb.exe shell
```

```sh
su
id
```

### system 可写

```powershell
.\adb.exe root
.\adb.exe remount
```

### 找用户 CA

```sh
ls -l /data/misc/user/0/cacerts-added/
```

### 安装系统 CA

```sh
cp /data/misc/user/0/cacerts-added/c8750f0d.0 \
  /system/etc/security/cacerts/c8750f0d.0

chmod 644 /system/etc/security/cacerts/c8750f0d.0
chown root:root /system/etc/security/cacerts/c8750f0d.0

ls -l /system/etc/security/cacerts/c8750f0d.0
reboot
```

### mitmweb

```powershell
mitmweb --listen-host 0.0.0.0 --listen-port 8080
```

### 强制停止 App

```powershell
.\adb.exe shell am force-stop <package.name>
```

### TLS / SSL 日志

```powershell
.\adb.exe logcat -c
.\adb.exe logcat | findstr /i "ssl tls certificate handshake okhttp cronet conscrypt"
```

---

## 24. 本次最关键的几个坑

如果以后只看这一节，也基本够用：

### 坑 1：APK 只有 ARM64

普通 x86_64 AOSP 模拟器不适合。

**解决：使用 LDPlayer 9 这类支持 ARM App 的模拟器。**

### 坑 2：浏览器能抓，App 不能抓

用户 CA 不等于系统 CA。

**解决：把 mitmproxy CA 放进 `/system/etc/security/cacerts/`。**

### 坑 3：`su` 已经 Root，但 `adb remount` 仍 Permission denied

Root 成功不代表 system 分区可写。

**解决：LDPlayer 中将 System Disk 改成 Writable，并完整重启。**

### 坑 4：终于抓到了，但请求多到看不懂

不要靠肉眼扫全部请求。

**解决：域名过滤 + Method / URL 过滤 + 清空流量 + 单动作触发。**

---

至此，这套链路可以概括成：

```text
ARM64 App
→ LDPlayer 9
→ Root
→ Writable system
→ mitmproxy 系统 CA
→ Windows mitmweb
→ 域名 / Method / URL 过滤
→ 单动作定位业务请求
```
