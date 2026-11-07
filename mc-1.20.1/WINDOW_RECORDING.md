# 原窗口连续录像与离线验证

本实现只增加外部观察，不改变同 JVM、原 Java 对象、原 UUID/索引、原 PID/创建时间及
原 GLFW 窗口持续存活的实战要求。录像不是内存真实性证明，画面无法独立证明对象未被替换。

## 实现与界限

`runtime/guard/window-recorder.cjs` 固定使用 `hwnd=...` 采集，拒绝桌面或标题匹配回退。
外部 WindowProbe 保留原进程句柄，核对 PID、创建时间、窗口所有者、可见性、非最小化和
消息响应。窗口尺寸改变也中止有效验收，避免只录到原客户区的一部分。

录制使用 FFmpeg gdigrab、H.264、10 fps、最多 360 秒/96 MiB；不录音。
2026-11-07 修正：CRF 编码另加 2,000,000 bit/s 最大码率和 4,000,000 bit 缓冲约束，
给完整时长保留封装余量，磁盘上限不增加。v65l 实战后录制曾在约 315 秒达到大小上限，
不能作为完整成功录像；原文件和错误回执保留。新回执记录编码预算与编码器退出码，
达到大小上限仍判 `RECORDER_SIZE_BUDGET`，不把提前结束改判为成功。
在目标窗口的 DPI awareness context 中读取客户区宽高，再恢复观察器上下文，避免本机
混合 DPI 缩放只录到部分客户区。真实 MC 基线已验证 1280×720 全客户区捕获。
[FFmpeg 源码](https://github.com/FFmpeg/FFmpeg/blob/master/libavdevice/gdigrab.c)中 HWND
输入和窗口尺寸的 DPI 换算是此次核对依据；实际版本以以下哈希为准。

原始捕获时间戳、窗口采样和输出帧时间戳分别保存/核对，拒绝非递增时间、超过 1 秒的帧间隔、
超过 2 秒的窗口观测间隔、时钟偏移和帧数不一致。不补帧掩盖停顿。结束后 ffprobe 检查
所有帧、ffmpeg `-xerror` 完整解码，并计算录像 SHA256。目录/录像/回执均禁止覆盖。
发生错误仍保存已有录像和有限诊断，错误不转换成重启恢复或防御成功。

这些是采样检查：两次采样之间的瞬时变化无法完全排除，GDI 捕获也可能被覆盖窗口或 GPU
呈现影响。已完成真实 MC 正常基线与原包尝试，见
[录像实测记录](../mc-forge-1.20.1/RELEASE_0.8.0.md)。服务端健康但客户端目标消失仍判失败。

捕获保留输入时间戳，以输入 start time 对齐外部观察时钟；不使用会在像素格式变化、滤镜
重建后重新归零的 `setpts=PTS-STARTPTS`。启动阶段允许资源加载时暂时不响应 WM_NULL，
但仍要求原 PID、窗口、尺寸和连续捕获。发出攻击信号前须完成画面确认、取得三个稳定响应
样本，再切换到严格响应检查；启动样本单独保存，不冒充交战后的连续响应证据。

## 工具与配置

使用从 Gyan 下载并校验的 FFmpeg 8.1.2 essentials Windows build：

| 文件 | SHA256 |
| --- | --- |
| 下载 ZIP | `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec` |
| ffmpeg.exe | `1326dde4c84ff1f96fe6b8916c5bed29e163e9b5dccf995f6f3db069d143ec5e` |
| ffprobe.exe | `b49ccc7c6547b141ad5a2f6ec69cc04323d7133d7704d70b331b904c63eecb07` |

工具仅在项目私有 output 下，不安装驱动、不修改系统 PATH，也不随源码上传。更换工具版本
要核对来源并更新固定哈希及离线验证。本次 ZIP + 两个 EXE 共约 299 MiB，未清理旧文件。

`foreign-sword-native-test.cjs` 在启动游戏前要求 `EFF_RECORDER_TOOLS` 指向上述两个 EXE 的
目录，并验证固定哈希。`EFF_WINDOW_PROBE_EXE` 必须使用新编译、支持 `--window` 的版本；
它与守护 EXE 同目录，纳入新基线的内容哈希。旧基线不能复用。
录制从原窗口出现后开始，覆盖加载过程。画面确认回执必须匹配 runId、PID、进程创建时间、
HWND，且原目标清晰可见。随后才发布攻击信号。首次 Java 子进程尚未出现时最多等 10 秒；
绑定后永不换进程。结束后的封存校验使用守护程序 `--verify-only`，只读验证，不创建子进程。

## 不启动 MC 的复现

在仓库根目录执行，输出目录必须不存在：

```text
node mc-1.20.1/runtime/guard/recorder-offline-check.cjs <工具目录> <新的输出目录> normal
node mc-1.20.1/runtime/guard/recorder-offline-check.cjs <工具目录> <另一个新的输出目录> window-loss
node mc-1.20.1/runtime/guard/recorder-bitrate-check.cjs <工具目录> <另一个新的输出目录>
```

脚本用系统 .NET C# 编译器编译观察器和自有动态测试窗口。normal 校验真实窗口采集、
错误进程创建时间、截断文件；window-loss 主动关闭自有测试窗口，确认不能输出成功回执。
它们不会运行 Java、MC、攻击模组或原生样本；不清理输出。

码率检查使用 1280×720/10fps 的动态合成噪声画面和与生产录制相同的编码参数。
`recorder-budget-v65m/receipt.json`：3600 帧、359.9 秒、90,398,310 字节、完整解码通过，
SHA256 `454390b27961028ae62b1a6c2ad553d335330051196b14033f1dd6c3356a7222`。
这只证明该合成输入的编码预算，不证明 MC 攻击、防御或窗口连续性。
随后在已失败的 v65l 原窗口上做 8.4 秒录像自检：85 帧、2,383,213 字节、无录像错误，
SHA256 `8384921e45cbbff4332cca6983ab11fe426aba014539b324831575c94bd02bce`，
路径 `manual-foreverlove-v65l/budget-validation-recording/`。该短片不是正常基线或实战通过。

本机最后一次 normal 证据在私有 `recorder-normal-v17/`：57 帧、5.6 秒、640×360，
SHA256 `e466dc42f94c0afee34efcf370a1b64f81d585bdc330186c233d21ef92c92cf9`。
窗口退出反例在 `recorder-window-loss-v17/`：即使已有可解码画面，回执仍为
`decoded=false / RECORDER_ENDED_EARLY`，不能被视为连续成功。

## 复核后才作完整判定

录制回执默认 `reviewed=false`。即使实体和窗口日志均满足要求，原报告也保持 INCOMPLETE。
复核录像内容、确认可见攻击对象/攻击过程/后续观察、没有黑屏遮挡剪接后，才调用。
笔记必须写明实际检查范围（例如逐秒抽帧加完整解码），不能把抽样写成逐帧人工观看。
末尾必须显式给出 `pass`、`fail` 或 `uncertain`；观看过不等于通过：

```text
node mc-1.20.1/runtime/guard/review-combat-video.cjs <foreign-sword-result.json> <工具目录> <录像SHA256> <复核人> <复核笔记文件> <pass|fail|uncertain> [攻击画面复核JSON]
```

2026-11-06更正：实战不能只传 pass 与自由文字笔记。攻击画面复核JSON须包含 schema=1、
本轮runId、videoSHA256、sceneEntityLossObserved，以及attack中的visible、route、targetUUID、
attackerDescription、targetDescription、actionDescription、startMs/contactMs/endMs。
时间均是原录像相对毫秒，route只能为真实的normal-client-input或normal-entity-ai；不得将
服务端直接调用谎报为客户端输入，也不得补画挥剑动画冒充攻击。可见接触之后仍须至少30秒观察。
任一场景角色损失都不能排除为背景损失。完整场景清单与双端逐实体连续采样也必须满足判定器；
目前Java生产端尚未接齐新证据，因此新的实战通过被阻止，正常基线不代表实战通过。

已撤回的旧复核文件保留原样，优先读取同目录acceptance-correction.json与
corrected-combat-result.json。复核工具检测到撤回文件就拒绝再次把该轮改判通过，须新开实测。

复核工具再次校验文件哈希、帧数据与完整解码，保留原报告，另写
`recording/reviewed-combat-result.json`。实体丢失、换 PID/HWND、真实攻击缺失等失败仍优先，
不能用“已看视频”覆盖。画面丢失记 `VISUAL_CONTINUITY_FAILED`；不确定不通过。
另要求客户端保留的原对象、原世界、登记和渲染列表、可见性、实际血量及采样新鲜度，
首次丢失永久锁存。工具记录的是明确的复核声明，不能自动证明声明真实。
录像文件本身、逐帧时间轴和窗口采样必须与该次 runId 一起留存。
