# EFF 本地版 0.3：本地双代理现象战争

以最新箱庭版为基础，提供可独立启动的 Windows x64 便携程序、文件存档和可重放的技术争夺。完整技术框架见 [实施文档](../docs/eff-local-implementation.md)。

## 游玩

解压整个发行包，双击 `EFF.exe`。资源全部随包提供，不需要 Python、Node.js 或网页服务器。原文之旅保持九种结局与全部原文；现象战争使用独立存档，在庭院指控读完后开放防御分析窗口。主菜单还可直接练习，练习不改变剧情。

意志模式选择目标并审阅模板；协作模式可编辑建议；研究模式输入五种数据式规则。每轮显示两方提案的受理结果和实际状态。三项目标完成后回到原文逐项回应，不能直接跳过拒绝段或终章。预算耗尽可以回到原场景，或明确接受既有占据结局。

规划窗口明确暂停主线期限。正文回读、刷新与旧 v1 检查点保持；实验日志另存。雨塔的原介绍完成后，防御提示才署名压抑；终章的实际回写仍遵守无意识介入条件。

## 存档迁移与退出

默认文件在 `%APPDATA%/EFF Local/saves/save-state.json`，旁边有上一次有效备份 `.bak`。原文和技术模式分开保存，不覆盖原网页 localStorage。

主菜单可导出完整 EFF 本地包；导入选择当前目标模式，只写该模式。支持旧版单个 v1 运行存档 JSON，以及 `eff-browser-backup` 文件。要迁移浏览器进度，在原来游玩的同一访问地址、同一浏览器打开本版本的 `local-version/` 菜单导出，再在本地程序导入；不同网站、端口或浏览器的存储不自动互通。导入一个运行存档不凭空生成图鉴。

关闭窗口或“退出游戏”取消本游戏模型请求、完成文件写入并退出。无自启动、后台再生或游戏自建推理子进程。用户已有 Ollama 仍由用户自己管理。删除游戏目录即可移除便携程序；要清除进度，可在退出后删除其专用数据目录。

## 模型状态

默认不使用模型，两侧均有确定性规则。启动自己已有的 Ollama，在 EFF 主菜单点击“检测服务与模型”，选择本地模型与预算，再点“启用双代理”。压抑侧与外来者共享权重、分别创建上下文并依次生成；外来者看不到玩家当前草案。模型不直接决定胜负，双方提案需玩家审阅，再由核心单次仲裁。

每侧可选 8/20/45 秒预算；错误或超时单侧回退并显示来源，取消后丢弃旧结果。云模型不会启用，不下载或安装模型。游戏仅连接固定的本地 Ollama API。主菜单可以停止 AI；自己的 Ollama 服务仍由自己管理。

已使用本机 qwen3.5:4b 完成真实六份双侧生成与实际窗口对战；不把这一台机器的测量作为所有硬件和模型的保证。实现、测量和范围见[本地 AI 说明](../docs/eff-local-ai.md)。本轮支持有限候选策略规划，Wasm 和引擎演化属于后续。

## 构建与测试

前端仍为静态脚本。桌面源码在 `desktop/`；Electron 固定 44.7.2。官方下载的 Windows x64 ZIP 已按官方 SHASUMS256 验证，本次摘要为 `10a89447ef64ac5cb9f782af48ffd83734a40ae91681259d1048ca3c9e6c5da4`。

```sh
node desktop/package-local.cjs ELECTRON_DIRECTORY NEW_OUTPUT_DIRECTORY
node tests/pixel-regression.cjs
node --test tests/phenomenon-runtime.test.cjs tests/local-host.test.cjs tests/local-agents.test.cjs
```

构建只复制受审计的前端和四个宿主模块，不复制小说原稿、用户存档或开发工具。输出目录必须是新目录，不自动删掉旧版本。`EFF-build-manifest.json` 记录随包源码 SHA256；摘要用于定位构建与意外损坏，不保证设备所有者无法修改游戏。

真实窗口测试需已有 Playwright，设置 `EFF_ELECTRON_PATH` 后运行：

```sh
node tests/local-native-smoke.cjs
node tests/local-native-flow.cjs
# 已有本地服务和权重时，设置 EFF_LIVE_MODEL 后：
node tests/local-model-live.cjs
node tests/local-native-ai.cjs
```

测试使用独立的新数据目录，覆盖真实离线启动、渲染器 Node 隔离、文件存档、旧档、规划暂停与刷新、原拒绝段衔接、身份揭示和 BAD END 05。Node VM 仅用于原剧情回归，不用于执行研究规则。
