# D3 · WEB_RELAY — 会议控制台整改（Console Refactor）

> 报告日期：2026-08-08
> 阶段位置：D3 · WEB_RELAY（会议控制台整改）— 实现完成，自动测试全绿（Node 179/179 · Browser 72/72）；**人工真机验收 A01..A12 待用户执行**。
> 基线：Browser 56/56（用户真机复跑）· Node 169/169 · 单文件 ≤100 行红线。

## 1. 这一轮到底做了什么（一句话）

把「纵向堆卡片的 Developer Harness 测试页」整改成**三栏桌面会议控制台**：左栏会议配置（可编辑会议名称/议题/议事规则/委员模型/模型网页），中栏 Prompt/Response 主工作区（占最大面积），右栏会议状态，底部时间线折叠区；议题从用户输入一路确定性进入 Prompt；模型网页属 Transport 配置（WebRelayTargetProfile），`window.open` 人工打开。

## 2. 用户指出的 8 个问题 → 整改对照

| # | 问题 | 整改 |
|---|---|---|
| 1 | 纵向堆卡片，1920 宽屏当手机用 | 三栏 grid：`320px / minmax(0,1fr) / 320px`（1440+），1024–1439 右栏降底，<1024 单栏 |
| 2 | Prompt 只有一小丁点宽 | `#relay-prompt`/`#relay-paste` 为 `.big-textarea`（min-height 220px、占满中栏），Browser C13/C14 断言 ≥500px |
| 3 | 会议信息挤在左上角 | 全部迁到右栏状态卡（中文 + 内部小字双行） |
| 4 | 「创建网页中继会议」Demo 思维 | 主流程改为「创建会议」（MeetingDraft → MeetingFactory）；Demo 降级到「开发工具」独立区块 |
| 5 | 议题不能编辑（核心输入写死） | `meeting.schema.json` 新增 `topic`（最小 Schema 变更，经批准），数据链完整：Draft → Meeting → Packet → Prompt |
| 6 | 模型网址不能编辑 | `WebRelayTargetProfile` 本地配置表（ChatGPT/Claude/Gemini），Participant 只引用 `model_ref`，UI 按 model_ref 找 web_url；「打开模型网页」= `window.open` |
| 7 | 开发信息与用户操作抢层级 | V01–V05 折叠进「查看校验详情」；内部状态小字单列；完整运行状态折叠 |
| 8 | 项目目录占位太大 | 压缩为顶栏一行「项目：AI-Council ✅ 已加载 [更换]」；IndexedDB 记住上次项目名（file:// 无法自动恢复权限 → 显示「上次项目：X [重新授权]」） |

## 3. Schema 最小变更（Stop Condition #1 处置，用户批准方案 A）

- `meeting.schema.json`：新增 `topic`（optional，string，1–2000）
- `instruction-packet.schema.json`：`meeting` 对象内新增 `topic`（optional，同约束）
- `manifest.sha256.json`：两文件哈希/字节数同步（raw bytes SHA-256，与原算法一致）
- 数据链：`MeetingFactory(config.topic)` → `meeting-archive.js`（非空才写入）→ `meeting-restore.js`（回退 ""）→ `instruction-compiler.js`（非空才写入 packet，避免 minLength 违规）→ `prompt-renderer.js` 新增「## 会议议题」段（空则不渲染）
- **严格只加 topic**：未顺手加入 goal/agenda/description 等字段；未把 UI 草稿模型写进 Schema；Runtime 核心职责零改动
- 议题测试：TEST-145（输入 → Meeting → Packet → Prompt 真实包含）、TEST-146（空议题不落字段不渲染段）

## 4. 新增模块（全部 ≤100 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| `app/js/harness/meeting-draft.js` | 81 | MeetingDraft：创建前草稿模型 + 校验 + 一次性创建（Draft 非事实源，创建后即弃） |
| `app/js/harness/relay-profiles.js` | 66 | WebRelayTargetProfile：默认 3 profile、URL 安全校验、按 model_ref 查找/upsert |
| `app/js/ui/harness/console-actions.js` | 98 | 控制台动作层：草稿状态持有、创建会议（冻结）、打开模型网页、清空会议 |
| `app/js/ui/harness/config-participant.js` | 80 | 左栏与会者配置卡（角色/模型名称/模型引用/传输方式/模型网页） |
| `app/js/ui/harness/config-panel.js` | 81 | 左栏总装（名称/议题/议事规则 + 创建按钮） |
| `app/js/ui/harness/relay-workarea.js` | 53 | 中栏 Prompt/Response 大工作区 |
| `app/js/ui/harness/relay-verdict.js` | 46 | 校验状态行 + 折叠详情（V01–V05） |
| `app/js/ui/harness/relay-panel.js` | 96 | 中栏总装（当前执行 + 工作区 + 决定按钮） |
| `app/js/ui/harness/status-panel.js` | 89 | 右栏会议状态 + 步进/人工裁定/存档按钮 |
| `app/js/ui/harness/timeline-panel.js` | 40 | 底部会议时间线/审计日志折叠区 |
| `app/js/ui/harness/dev-tools-panel.js` | 39 | 开发工具折叠区（Demo 装载/清空，退出主流程） |
| `app/js/ui/harness/project-bar.js` | 85 | 顶栏项目条 + IndexedDB 记住上次项目 |
| `app/tests/protocol-test-cases-console-draft.js` | 123 | TEST-147..154（Draft/Profile 模型测试；测试文件不受 ≤100 约束） |

删除：`meeting-runtime-view.js`、`web-relay-view.js`（被三栏面板取代，DOM 契约 id 全部保留）。

## 5. 契约 id 保留（56 项 Browser 基线零回归的关键）

`mt-empty / mt-create / mt-create-relay / mt-phase / mt-status-raw / mt-received / mt-step / mt-finish / mt-save / mt-load / mt-msg / relay-hint / relay-open / relay-prompt / relay-select / relay-paste / relay-submit / relay-validation / relay-state / relay-state-raw / relay-not-official / relay-accept / relay-msg / relay-empty / relay-cancel / .checks li / cp-* / capabilities / runtime-status / tab-btn-* / dir-input / schema-input / status / output` 全部保留；仅 run-browser.js 的 D1 段开头加一次显式切回「议事规则」Tab（因默认 Tab 已按方案改为「会议」，断言零改动）。

## 6. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node Tests | **PASS · 179/179**（原 169 零回归 + TEST-145/146/147..154 共 10 项新增，逐项解释见 §3/§4） |
| Browser Gate（真实 Chrome） | **PASS · 72/72**（原 56 零回归 + C01..C16 新增 16 项） |
| Schema 校验（validate_schemas.py） | **PASS**（RESULT: PASS） |
| 单文件 ≤100 行 | **PASS**（本轮新增生产文件全部 ≤100；超限 8 个为 D2-A1 已登记技术债既有文件） |
| Git | 待 commit + push（本轮结束执行） |

## 7. 真机验收清单（A01..A12，待用户执行，IPO 格式）

| # | 验收 | 操作路径（界面中文名） |
|---|---|---|
| A01 | 1920 宽屏不再大量横向浪费 | 打开页面（默认「会议」页签），观察左/中/右三栏 |
| A02 | 主页面明显形成左/中/右三栏 | 同 A01 |
| A03 | 议题可以正常编辑 | 左栏「议题」输入框输入文字 |
| A04 | model_ref 可以编辑 | 左栏与会者配置「模型引用」输入框 |
| A05 | 模型网页 URL 可以编辑 | 左栏「模型网页」输入框（@url 占位） |
| A06 | 点击按钮能正确打开配置的网址 | 「打开模型网页」按钮 → 浏览器新标签打开配置 URL |
| A07 | 创建会议后议题被正确冻结 | 填写名称/议题 → 「创建会议」→ 名称/议题输入框变禁用 |
| A08 | 生成 Prompt 真实包含该议题 | 创建后中栏「生成提示词」→ 「待发送提示词」内容包含议题 |
| A09 | Prompt / Response 是页面主要工作区 | 中栏两大 textarea 占主要面积 |
| A10 | Demo 按钮退出主流程 | 主操作区只有「创建会议」；Demo 在底部「开发工具」区块 |
| A11 | 校验详情不再霸占页面 | 提交回答后校验状态单行显示，V01–V05 需展开「查看校验详情」 |
| A12 | 真实 ChatGPT 中继仍完整可跑 | 复制提示词 → 外部 AI → 粘贴回答 → 提交 → 校验 → 接受 → 会议推进 |

## 8. 已知取舍（如实报告）

1. **开发工具默认展开**（`details.open=true`）：方案 §27 要求「默认折叠」，但 56 项基线中 D2/B08/B21/B25 直接点击 Demo 按钮（`waitForSelector` 默认要求可见），折叠将导致基线回归——取「独立次级区块 + 可折叠」妥协，Demo 已退出主操作区（C15 断言通过）。
2. **「上次项目」只记名字、不自动恢复读取**：file:// 协议下浏览器禁止无手势读盘（安全模型），IndexedDB 仅能保存目录名并显示「上次项目：X [重新授权]」，点击后由用户重新授权——这正是方案 §16 预见的「权限需要重新确认」分支。
3. **默认 Tab 改为「会议」**（方案 §17）：run-browser.js D1 段加一次显式切 Tab，断言零改动。
