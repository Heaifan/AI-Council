# D3 · WEB_RELAY — 六席会议控制台重构（Six-Seat Console Refactor）

> 报告日期：2026-08-08
> 阶段位置：D3 · WEB_RELAY（六席会议控制台重构）— 实现完成，自动测试全绿（Node 185/185 · Browser 86/86）；**人工真机验收 A01..A10 待用户执行**。
> 基线：Browser 72/72 · Node 179/179 · 单文件 ≤100 行红线。

## 1. 这一轮到底做了什么（一句话）

把「三栏表单型页面」重构为**六席会议控制台**：左右各 3 席摘要卡（A 侧支持 / B 侧质疑），中央唯一操作大屏（运行 / 席位配置双模式），底部时间线折叠区；席位详细配置不再长期铺开，点「编辑」进中央大屏；底层仍跑 D3 单席位 WEB_RELAY 能力（不做多 Agent 并发调度）。

## 2. 用户方案 → 落地对照

| 方案要点 | 落地 |
|---|---|
| 左右 6 席摘要卡（不是表单） | `SeatCard`：席位编号/角色/模型/引用/传输/立场/状态/当前轮次 + [选中][编辑][打开网页] |
| 中央大屏 = 唯一主工作区 | `CenterStage`：模式条 + 上下文行 + 会议配置卡（常驻）+ 运行/席位配置双面板（显隐切换） |
| 席位可配置但不铺开 | 点「编辑」→ 中央切席位配置模式（角色/模型名/引用/传输/URL/立场/备注） |
| 立场（stance） | 席位级本地配置（SeatLocalConfig），默认按 side_id 派生（A→支持/B→反对），可覆盖；**不污染 Participant Schema** |
| 创建前可编辑、创建后冻结 | 冻结：名称/议题/协议/role/model_ref/transport_kind；仍可改：web_url/显示名/立场/备注 |
| 模型网址可编辑 | RelayTargetProfile 继续生效（web_url 属 Transport 配置，Participant 只引用 model_ref） |
| 打开模型网页 | `window.open(url)` 仅 http/https、空/非法禁用 |
| 会议状态不再做大卡 | 右栏席位下方窄摘要（状态/内部/阶段/应发言/已接收/事件数 + 步进/裁定/存档按钮） |
| 底部折叠区 | 时间线/审计日志（TimelinePanel）+ 开发工具条 |
| 六席壳先上、D4 调度不做 | 明确不做：六席并发调度/自动多 Agent/battle 复杂 UI/自动切换网页 AI |

## 3. 新增/变更文件（全部 ≤100 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| `app/js/harness/seat-layout.js` | 86 | 六席纯逻辑：SEATS 顺序/立场默认/mapParticipants 映射/stance 覆盖/sixSeatParticipants 模板 |
| `app/js/ui/harness/seat-local-config.js` | 44 | 席位本地 UI 配置（立场覆盖/备注/模式/选中席位） |
| `app/js/ui/harness/seat-status.js` | 37 | 席位状态中文判定 + 当前轮次判定（纯函数） |
| `app/js/ui/harness/seat-card.js` | 76 | 席位摘要卡渲染 |
| `app/js/ui/harness/seat-column.js` | 90 | 左右席列装配 + 右栏会议摘要窄卡（mt-* 契约 id） |
| `app/js/ui/harness/seat-config-fields.js` | 94 | 席位配置表单字段构建（cfg-*-<pid> 契约 id） |
| `app/js/ui/harness/seat-config-panel.js` | 51 | 席位配置模式装配 |
| `app/js/ui/harness/center-stage.js` | 70 | 中央大屏：模式条/上下文/会议配置卡/双面板显隐 |
| `app/js/ui/harness/console-actions.js` | 100 | 动作层（Draft 持有/创建冻结/打开网页/清空） |
| `app/tests/protocol-test-cases-seat-layout.js` | 95 | TEST-155..160（测试文件不受 ≤100 约束） |

变更：`config-panel.js`（只做会议配置卡）、`harness-shell.js`（六席装配）、`meeting-actions.js`（Demo 创建后切运行模式）、`index.html`/`app.css`（六席布局）。
删除：`config-participant.js`、`status-panel.js`（被 SeatColumn/SeatConfigFields 取代，契约 id 全部保留）。

## 4. 契约 id 保留（86 项 Browser 全绿的关键）

`mt-empty/mt-status-raw/mt-phase/mt-received/mt-step/mt-finish/mt-save/mt-load/mt-msg/mt-create/mt-create-relay/mt-clear/relay-*（全套）/cfg-title/cfg-topic/cfg-protocol/cfg-create/cfg-model-ref-agent-a1/cfg-url-agent-a1/cfg-open-web-agent-a1/capabilities/runtime-status/project-bar/tab-btn-*/dir-input/schema-input/status/output` 全部保留；新增 `seat-*` 系列。

## 5. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node Tests | **PASS · 185/185**（179 零回归 + TEST-155..160 六席映射/立场/模板/冻结，逐项解释见 §3） |
| Browser Gate（真实 Chrome） | **PASS · 86/86**（72 零回归 + S01..S14 六席布局/配置/运行新增） |
| 单文件 ≤100 行 | **PASS**（本轮新增/变更生产文件全部 ≤100；超限 8 个为 D2-A1 已登记技术债既有文件） |
| Git | 待 commit + push |

## 6. 真机验收清单（A01..A10，待用户执行）

| # | 验收 | 操作路径（界面中文名） |
|---|---|---|
| A01 | 页面明显是「左右六席 + 中间大屏」 | 打开页面（默认「会议」页签） |
| A02 | 两侧不是大堆表单，而是席位摘要卡 | 左右各 3 张席位卡（编号/角色/模型/立场/状态） |
| A03 | 点击席位可以配置 | 点席位卡「编辑」→ 中央切席位配置（含立场/备注） |
| A04 | 会议名称/议题/协议可编辑 | 中央「会议配置」卡 |
| A05 | 模型网页 URL 可编辑 | 席位配置「模型网页」输入框 |
| A06 | 打开模型网页有效 | 「打开模型网页」→ 新标签打开配置 URL |
| A07 | 中间 Prompt/Response 是主要工作区 | 创建会议后中央两大 textarea |
| A08 | 当前轮到谁时该席位高亮 | 创建含 web_relay 的会议，观察 A1 卡「当前轮次」高亮 |
| A09 | 创建会议后核心配置冻结 | 创建后名称/议题/引用/传输禁用；URL/立场/备注仍可改 |
| A10 | 真实 ChatGPT 中继链完整 | 复制提示词 → 外部 AI → 粘贴 → 提交 → 校验 → 接受 → 会议推进 |

## 7. 已知取舍（如实报告）

1. **中央大屏采用双模式（运行/席位配置）而非三模式**：方案 Task3 的模式 3「会议配置」以**常驻会议配置卡**实现（无会议=可编辑表单，有会议=冻结摘要），避免「会议配置」再占一个整屏——语义等价，C/S 系列测试全部覆盖。
2. **六席参与者模板**：主流程「创建会议」用 `sixSeatParticipants()`（A1..A3/B1..B3，A1=web_relay+chatgpt-web）；既有 3 人版 `defaultParticipants` 保留（开发工具 Demo 与 TEST-147 语义不动）。
3. **运行模式默认进入**：创建会议/加载 Demo 后自动切「会议运行」；无会议时默认「席位配置」模式（A1 选中）。
