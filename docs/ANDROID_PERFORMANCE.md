# Android 8.1 信息流与正文性能记录

2026 年 11 月 24 日，在三星 SM-P583 平板（Android 8.1 / API 27、32 位 ARM、1200 × 1920、60 Hz）上用 Release 验证包测量。点击卡片时记录到首批正文排版的耗时，滑动时记录屏幕连续两次显示新画面的间隔。

## 从卡片打开正文

两份验证包使用相同的 Hermes 构建配置及 Windows Metro 路径修复。一份基于 `v0.10.1`（`76e3265`），另一份加入正文优化。列表中有 18 张卡片，文章正文已在内存中。每次点开第一张卡片，展示同一篇 80 段的合成文章。从游客卡片开始处理点击到首批正文触发原生布局回调，记录首次冷进程内打开以及返回列表后再打开四次的耗时。

| 点击到首批布局 | v0.10.1 基线 | 正文优化后 |
| --- | ---: | ---: |
| 首次打开 | 4,789 ms | 851 ms |
| 五次中位数 | 3,747 ms | 490 ms |

移动端游客导航传递标题、作者、摘要等小字段，稳定 ID 的正文按会话、类型和 ID 从内存缓存读取。游客长文和折叠回答先排首批内容，打开图库时再收集图片。这组数据反映已取得正文时的排版与导航开销。线上首次联网获取内容的时间需另测。

同一列表的滑动也做了三轮对照。Android `gfxinfo` 记录的各轮 P95 帧耗时分别为 73、77、77 ms 和 69、73、73 ms。打开正文快了许多，列表滑动的改善很小。

## 滑动时的实际呈现间隔

这块屏幕约每 16.7 ms 刷新一次。读取 SurfaceFlinger 活动窗口相邻两帧的**实际呈现时间**，间隔超过 1.5 个刷新周期（约 25 ms）计为一次长间隔。每个条件测三轮，每轮四次 420 ms 滑动。下表给出三轮合计的“长间隔数 / 采样间隔数”和占比。P95 是每轮实际呈现间隔的第 95 百分位，表中取三轮的范围。`gfxinfo` 记录的是应用帧流水线耗时，其 P95 不能直接换算成屏幕帧率。[Android 8.1 的呈现时间字段](https://android.googlesource.com/platform/frameworks/native/+/android-8.1.0_r3/services/surfaceflinger/FrameTracker.cpp#244)

| 同包对照 | 界面 | 对照条件 | 优化条件 | 各轮 P95（对照 → 优化） |
| --- | --- | ---: | ---: | --- |
| 水波纹 → 仅透明度 | 固定离线卡片 | 96/99（97.0%） | 78/166（47.0%） | 50.1 → 33.4 ms |
| 水波纹 → 仅透明度 | 游客真实推荐 | 111/164（67.7%） | 68/223（30.5%） | 50.0–50.1 → 33.4 ms |
| 性能模式关 → 开 | 固定离线卡片 | 65/160（40.6%） | 4/242（1.7%） | 33.4 → 16.7–16.8 ms |
| 性能模式关 → 开 | 已登录真实推荐 | 40/254（15.7%） | 8/267（3.0%） | 33.4 → 16.7–16.8 ms |

前两行只换按压样式。水波纹使用外层圆角裁剪和内层按压控件，“仅透明度”通过单个 Pressable 的按下状态调整透明度。后两行在另一次构建中测量，**开关两侧的按压样式都是“仅透明度”**。性能模式将推荐和关注里的问题、回答、文章改用文字卡片，省去装饰性头像、缩略图和操作图标，保留作者、评论、收藏等入口。打开正文时跳过标题过渡测量。想法与视频继续使用各自的卡片。

为检验设备本身能否流畅滚动，另测了 18 行、每行 176 dp 的 Android 原生文字列表，以及使用相同行高的 FlashList 简化文字卡片。两者的呈现间隔中位数均为 16.7 ms，完整卡片配水波纹时为 33.4 ms。单独打开整卡硬件纹理缓存或替换边缘渐变遮罩，均未在相同的完整卡片上测出稳定收益，因此保留原实现。真实推荐的条目和图片会随刷新变化，固定离线样本对隔离渲染差异更有参考价值。这些数字来自一台设备。

## 用实际推荐页复测

在同一台设备安装同一份 Release 包。要比较开关，在“设置 → 外观与阅读”关闭性能模式，在“按压反馈”启用视觉反馈并选“仅透明度”。回到推荐页，等列表加载，采三轮。再开启性能模式，回到同一列表位置重复采样。要单独比较按压效果，全程关闭性能模式，只切换“水波纹”和“仅透明度”。对照时固定账号状态、方向、刷新率和手势位置。[本地 Android 构建说明](./BUILD_WINDOWS.md)

以下 Python 3.8+ 片段只依赖标准库和 PATH 中的 `adb`，可在已连接的 Android 8.1 平板上对当前推荐页采样。按实际安装包名和屏幕尺寸调整 `package`、滑动坐标。每次手势前读取上一帧，仅对随后第一帧起 420 ms 内的新增呈现时间求差，避免将手势间停顿计入。SurfaceFlinger 第一行是刷新周期，后续数据的第二列是实际呈现时间，单位均为纳秒。

```python
import shlex
import subprocess
import time

package = "com.huamu013.ZhihuMinusMinus"

def shell(*args):
    return subprocess.check_output(
        ["adb", "-d", "shell", shlex.join(args)], text=True, encoding="utf-8"
    )

layers = [s.strip() for s in shell("dumpsys", "SurfaceFlinger", "--list").splitlines()
          if package + "/" in s and "MainActivity" in s
          and not any(k in s for k in ("SurfaceView", "Splash", "DimLayer", "Starting"))]
if len(layers) != 1:
    raise SystemExit("请确认推荐页在前台，并核对活动窗口名称")

def presented():
    rows = shell("dumpsys", "SurfaceFlinger", "--latency", layers[0]).splitlines()
    period = int(rows[0])
    times = {int(parts[1]) for line in rows[1:] if len(parts := line.split()) == 3
             and parts[1].isdigit() and 0 < int(parts[1]) < 2**63 - 1}
    return period, sorted(times)

for trial in range(1, 4):
    gaps = []
    for start, end in [(1460, 640), (1460, 640), (640, 1460), (640, 1460)]:
        _, before = presented()
        shell("input", "swipe", "600", str(start), "600", str(end), "420")
        time.sleep(0.35)
        period, after = presented()
        fresh = [t for t in after if t > max(before, default=0)]
        window = [t for t in fresh if t - fresh[0] <= 420_000_000]
        gaps.extend(b - a for a, b in zip(window, window[1:]))
        time.sleep(0.35)
    if gaps:
        p95 = sorted(gaps)[round(0.95 * (len(gaps) - 1))] / 1e6
        print(trial, "长间隔/采样数", sum(g > 1.5 * period for g in gaps), "/", len(gaps),
              "P95(ms)", round(p95, 1))
    else:
        print(trial, "无有效的新呈现帧，请核实图层和列表是否实际滚动")
```

同一条件下，将三轮长间隔数之和除以采样数之和即可比较占比。支持的图层与诊断接口会随 Android 版本改变。正文首批布局和固定离线卡片的数据来自一次性插桩验证包。普通 Release 包可直接复测上面的真实推荐页。
