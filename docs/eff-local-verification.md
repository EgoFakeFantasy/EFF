# 本地版验证说明

第四版 v0.6.0 的玩法与演出见[第四版说明](./eff-fourth-edition.md)，Windows 程序与对应源码从[发行页面](https://github.com/EgoFakeFantasy/EFF/releases/tag/v0.6.0)取得。每个程序包附构建清单，记录源码提交及应用文件的 SHA-256；发布资产另附校验文件。

## 分层验证

| 检查 | 验证内容 |
| --- | --- |
| 原游戏回归（100 项） | 九种结局、时间概率机制、059 正文、旧存档和原有操作 |
| 核心与宿主（47 项） | 确定性仲裁、数据提案、事件重放、存档与模式隔离、模型边界、演出映射、身体输入、碰撞、独立权限、位置接续、过去授权 |
| 实际 Windows 窗口 | 顶层输入隔离、全视口撕裂、完整终章文字、暂停与失焦、刷新、预览隔离、减少动态、重启和既有结局后的预览 |
| 世界生命周期 | 实际 utility 子进程、旧进程退出、新进程接续、身体位置保留、意外退出恢复、WebGL2 及上下文丢失后的 Canvas 回退 |
| 剧情衔接 | 庭院旧档的期限在规划时暂停，成功仍回到第一句拒绝段并保留三项原操作，失守保留原占据结局，身份依原雨塔节点揭示 |
| 本地双代理 | 两份独立上下文、同一 revision、审阅后执行、来源保存、取消、停止、推理期间退出和本游戏进程清理 |
| 原文数据 | combat-script.js 与 finale-script.js 对第四版开发前的 main 无差异 |

单元和回归测试可在仓库根目录运行：

    node tests/pixel-regression.cjs
    node --test tests/phenomenon-runtime.test.cjs tests/local-host.test.cjs tests/local-agents.test.cjs tests/spectacle-plan.test.cjs tests/world-runtime.test.cjs

实际窗口检查脚本为 tests/local-native-smoke.cjs、local-native-flow.cjs、local-native-spectacle.cjs、local-native-world.cjs 与 local-native-ai.cjs。它们使用 Playwright 和独立临时存档目录。环境变量 EFF_ELECTRON_PATH 指定开发运行时或实际 EFF.exe；验证发行包时设置 EFF_TEST_PACKAGED=1，程序不接收开发应用路径。AI 检查还需 EFF_LIVE_MODEL 指定玩家已经安装的本地模型。

## 结果的边界

第四版开发过程中，本机的原游戏 100 项与核心／宿主 47 项通过；实际 Windows 演出和世界窗口检查的 pageerror 为零。v0.6.0 的实际 EFF.exe 已通过五个 Windows 窗口脚本。已有 qwen3.5:4b 的复测完成三轮六份真实生成，无下载和模板回退，并验证了来源、刷新、取消、停止与推理中退出。首次复测曾在每侧 20 秒预算下超时，正确回退到模板；单独测得冷加载约 9.5 秒，模型载入后使用同一 20 秒预算复测通过。首次载入或机器繁忙时可选择每侧 45 秒预算。录屏与关键帧用于美术检查，不把采样当成全流程人工通关。

GitHub Actions 的 Check pixel game 自动运行回归、核心与语法检查；它不能替代本机 Windows、音频与真实模型的检查。远端 CI 是否完成，以对应提交的 Actions 结果为准。

模型只提出有限数据式方案；没有 Rust/Wasm 动态规则或任意生成代码执行。有限的本机模型测量不构成所有模型质量或最低硬件配置保证。纯浏览器预览没有原生世界进程，实际子进程退出／生成由 Windows 程序验证。
