# Changelog — AI 顾问委员会 v0.1

> 格式参考 Keep a Changelog。所有变更按时间倒序。

## MEETING-REPLAY-F1 · Timeline Replay（会议时间轴 / 只读回放）— 2026-08-08

- **目的**：Mock B1 从「待执行」到「已发言」极快，历史状态立即丢失；未来 Web Automation 多模型自动运行后更严重。本轮把会议变成**可回放的状态序列**：底部常驻时间轴（Round→Step 两级），上一步/下一步/回到当前只改 UI 回放游标，**绝不修改 Runtime/Message/EventLog/PendingAction**——历史不可篡改，允许自由回看（会议录像机，非 Undo；T10 明确不做 destructive rollback）。
- **核心**：`MeetingReplay.buildTimeline`（Event Cursor 重建：node 只记 event_cursor，Replay State = events[0..cursor-1] 派生，不复制整份 Meeting）；`ReplayProvider.get` 为 Display State 唯一出口（displayState = live | replay 视图），SeatCard/MeetingHud/RelayPanel/Summary 全部统一消费；回放视图清空 stateData.web_relay 防未来中继会话泄漏；ReplayCursor 用 -1 表示跟随最新（新会议不误判回放）。
- **UI**：底部时间轴常驻条（[◀ 上一步] 节点轨道 [下一步 ▶] [回到当前] + 当前节点标签，展开=事件日志）；回放模式中央黄色横幅「⏱ 正在查看历史状态 [回到当前会议]」，全部 mutating 按钮（执行/裁定/保存/加载/提交/接受/拒绝/重试/取消）禁用。
- **测试**：Node **203/203**（191 零回归 + TEST-173..184 十二项防御性门禁：单调/不改 live/不产 Message/PendingAction/恢复/回到当前/mutating/B1 before-after/跨阶段/save-load/不被污染/displayState 一致）；Browser **208/208**（197 零回归 + R01..R07 时间轴与回放模式真实点击）。save/load 后 timeline 一致（T08，存档已含 events）。
- **未决项**：Fork From Here（从历史节点新建分支）仅登记设计；messages 内容入事件为可选增强。
- 新增 `reports/meeting-replay-f1.md`；同步 file-tree.md。
- **状态**：`MEETING-REPLAY-F1: IMPLEMENTED · Node 203/203 · Browser 208/208`。

## MEETING-UX-F2-F1 · Seat Runtime Fields Unlock — 2026-08-08

- **目的**：真人验收发现「模型名称/模型网页仍无法编辑」→ 用户裁定 F2 = FUNCTIONAL PARTIAL PASS。本轮只修席位字段权限；**禁止 Edge Attach / Web Automation / 会议流程**（automation/ 行为层零 diff）。
- **真实根因（T01）**：不是 frozen 锁的——`seat-config-fields.js` 的 `name.disabled = !profile` / `url.disabled = !profile`：默认 profiles 仅 3 个（chatgpt-web/claude-web/gemini-web），六席模板 A2..B3 model_ref 为空；用户保存自定义 model_ref（如 deepseek）后刷新 → profile 找不到 → 模型名称/网页被 `!profile` 锁死且初始值为空。旧保存链路 `if (prof)` 在无 profile 时不落库显示名/URL（「看起来能编辑，实际只改前端内存」）。
- **单一字段权限表（T04）**：`SeatConfigRules.FIELD_POLICY`——identity（seatId/camp/roleId）运行中锁 / runtime（modelName/modelRef/modelUrl/transport/stance/note）恒可编辑；`canEdit` 唯一权限入口 + `FIELD_ALIAS` 兼容 participant 字段名；UI 三处 disabled 全部改消费它。
- **stance 语义核实**：代码证据（seat-layout 覆盖表 + meeting-factory 无 stance 字段）→ 不进 Protocol/snapshot，归 runtime 可编辑（TEST-166 背书）。
- **保存链路补全**：profile 不存在自动创建（upsert 追加）；新增 `SeatLocalConfig.runtimeConfig`（per-participant model_ref/transport_kind 持久化）→ 刷新后六席运行配置完整恢复（H03：保存→刷新→三字段保持）。
- **打开模型网页**：仅按 URL 有效性禁用（C06 语义保留）；`openWeb(modelRef, fallbackUrl)` 支持无 profile 直接打开。
- **测试**：Node **191/191**（TEST-161 重写 + 164 分类完整性 + 165 全矩阵 + 166 stance 不污染）；Browser **197/197**（156 零回归 + H01 六席 30 项 / H02 防覆盖 7 项 / H03 持久化 5 项）；Offline **14/14**；Schema PASS。
- 新增 `reports/d3-seat-runtime-unlock.md`；同步 file-tree.md。
- **状态**：`MEETING-UX-F2-F1: IMPLEMENTED · Node 191/191 · Browser 197/197 · Offline 14/14 · 待真人验收`。F2 系列字段权限自此钉死（单一来源，无五六个文件各自判断）。

## MEETING-UX-F2 · 固定 Meeting HUD + 席位编辑状态架构 — 2026-08-08

- **目的**：用户裁定 F1「只解决了一半」（顶部利用率 ❌ / 席位可靠编辑 ❌ / 自动化路线 ❌）。本轮仅修会议运行 UI 与席位配置状态；**禁止 Web Automation 开发**（automation/ 行为层零 diff）。
- **Meeting HUD（T01）**：新 `meeting-hud.js`——标题/议题（ellipsis+title）/Round（相位序号）/Phase/计时器/状态固定顶部，实测 56px ≤ 68px；`#runtime-status` 契约行内嵌 HUD；`setInterval` 1s 局部时钟只改 `#meeting-timer` 文本，**绝不触发全量 render**（T05；TEST-10 唯一白名单 `TIMER_EXEMPT`，注释声明本地 UI 时钟非网络轮询）。
- **压缩非核心状态（T02）**：能力灯 6 badge 收进「系统 ● 正常/异常」折叠弹层（#capabilities 契约容器在 HUD 内，data-capability/data-ok 保留，D2/B05 零改动）。
- **会前/运行分离（T03）**：运行态 `ConfigPanel` 折叠为一行摘要（会议名+议题+disabled 创建按钮）；表单字段 display:none 但 cfg-* 契约 DOM 常驻（C10/S10 isDisabled 可查、C15 创建按钮可见保留）；中央省 ~180px。
- **Seat Edit Draft（T04/T06）**：新 `seat-edit-draft.js`——表单值从独立草稿初始化，change 写草稿并标 dirty；**harness-shell 守卫**：中央正显示该席位表单且任一 dirty 时不重建中央（relay/timer/meeting 状态更新不得覆盖未保存输入）；保存/取消后 clear；换目录 resetAll。
- **S13 回归根因修复**：F2 顶部增高使 run 内容超中央高度 → exec 卡内嵌自动化卡（315px）挤扁工作区、verdict 盖住 relay-submit。修复：自动化卡拆出 exec 并默认折叠（details）；删除中央 context 卡（状态由 HUD 承担）。实测 submit<verdict 不重叠。
- **测试**：Node **188/188**；Browser **156/156**（135 零回归 + G01..G09：HUD 占位/高度/系统折叠/Round 显示/运行态摘要/**relay 状态变化编辑框元素引用不变+值保持**/**timer 更新元素引用不变+值保持**/切席草稿保留/保存清草稿/刷新持久化）；Offline **14/14**；Schema PASS；行数红线 PASS（console-actions 110 / harness-shell 103 登记 ≤110 例外）。
- **测试适配**：TEST-129 断言更新（HUD 容器 + MeetingHud 提供 #runtime-status 契约）；B03/D2/B05/C10/S10/C15 断言零改动（契约 DOM 保留策略）。
- 新增 `reports/d3-meeting-ux-f2.md`；新增模块 2 个（meeting-hud / seat-edit-draft）；同步 file-tree.md。
- **状态**：`MEETING-UX-F2: IMPLEMENTED · Node 188/188 · Browser 156/156 · Offline 14/14 · 真机验收（HUD/G 系列截图）待用户复跑`。

## ONE-SCREEN-F1 · 无滚动工作区 + 席位编辑恢复 — 2026-08-08

- **目的**：用户裁定「两个基础问题没解决之前继续测自动化没有意义」——① 会议页仍存在左右席位列和中央配置区纵向滚动条，必须实现真正 One-Screen；② 会议 frozen/running 后六个席位配置被错误整体锁死，必须恢复席位运行配置编辑能力。本轮严格只修这两个问题（不碰 Web Automation / 会议协议 / 其他 UI）。
- **One-Screen 布局**：body=100dvh flex 列 + overflow hidden；`main` flex:1 min-height:0；`.console` 删除 `calc(100vh-212px)` 与 `min-height:480px`（根因：旧 CSS 丢失 `html{height:100%}` 导致 html 被内容撑开自举放大）。席位卡 6 行字段 → 4 行紧凑摘要（单卡 ~132px）；中央会议配置卡与席位配置卡双栏 grid（备注跨列）；底部开发工具/时间线 = 32px drawer（默认折叠，展开 absolute 覆盖不挤压工作区，重绘保留展开状态）。
- **冻结解耦（Freeze Meeting ≠ Freeze Seat Configuration）**：新 `SeatConfigRules`（纯逻辑）：`FROZEN_FIELDS=["role_class"]` 字段级权限；创建后 role_class 冻结，**model_ref/transport_kind 可热改**；立场/备注/显示名/URL 永可编辑。`console-actions.setParticipantField` 原 frozen 整体拒绝 → 改为 `canEdit` 矩阵。
- **交互简化**：席位配置改挂起式编辑 + [取消]/[保存配置] 显式保存（`SeatConfigCommit` 新模块）→ 保存后 `✓ X 配置已保存` 自动返回会议运行；删除「返回会议运行」按钮。
- **持久化（T06）**：新 `LocalStore`（localStorage 封装）+ `SeatSessionStore`（draft/profiles）+ SeatLocalConfig 落盘；键前缀 `ai-council:v1:`；draft 一次性创建；刷新/重选目录后六席配置（显示名/URL/备注/立场 + 创建前引用/传输）保持；`reset()` 只清内存不清存储。
- **测试**：Node **188/188**（185 零回归 + TEST-161..163 冻结矩阵：字段级矩阵/创建前全写/创建后角色拒改引用热改）；Browser **135/135**（99 零回归 + F01..F18：1366×768 页面/控制台/左/中/右无滚动、四档分辨率、六席可见可进配置、创建后字段级冻结、保存自动回运行、卡片摘要刷新、会议参与者热改且事件零污染、六席保存→刷新持久化、drawer 默认折叠且不挤压）；Offline **14/14** 零回归；Schema PASS；≤100 红线 PASS（console-actions.js 110 ≤110 登记例外，同 request.js 先例）。
- **测试适配**：devtools 默认折叠推翻 D3 旧妥协（原「默认展开保可见性契约」）——5 处既有 `#mt-create*`/`#mt-clear` 点击改 `clickDevBtn`（展开→点击→立即折叠，防 overlay 拦截）；C06/C07/S 系列断言零改动（openBtn 按挂起 edits 实时计算）。
- **已知取舍**：1280×720 中央席位配置允许内部滚动（compact 极限，1366 主门禁无滚动）；seat 模式隐藏顶部模式条/上下文卡（省 80px，由取消/保存表达模式切换）；draft 持久化仅覆盖创建前（会议本身仍走既有手动存档）。
- 新增 `reports/d3-one-screen-f1.md`；新增模块 4 个（LocalStore/SeatConfigRules/SeatSessionStore/SeatConfigCommit）；同步 file-tree.md。
- **状态**：`ONE-SCREEN-F1: IMPLEMENTED · Node 188/188 · Browser 135/135 · Offline 14/14 · 真机验收（F 系列截图 + 四档分辨率）待用户复跑`。

## D3 · WEB_AUTOMATION — ChatGPT 单站 PoC — 2026-08-08

- **目的**：把「人工搬运 Prompt/Response」自动化。本地 Node Automation Worker（automation/）以 localhost 同源模式提供 UI + Automation API + 专用 Chrome Profile；只做 ChatGPT 单站；自动化结果必经校验 + 人工 Accept 才进正式会议（只替代搬运，不替代协议/运行时/校验/裁定）。自动化模式 `node automation/start.js` → http://127.0.0.1:3741/；Manual 模式双击 app/index.html 不变。
- **架构**：`automation/{core,browser,drivers,sites,server,ui,tests}`；AutomationDriver 接口（Transport 层不得直接 require playwright）→ PlaywrightDriver（launchPersistentContext + 专用 Profile，禁控制日常 Chrome）→ SiteAdapter → ChatGptSiteAdapter（ARIA/Role 优先 → 语义属性 → 结构候选带上下文验证，无 nth-child）。生成结束 = Stop 按钮消失 + 文本 1.5s 稳定窗口双保险（禁死等）。登录/验证码一律停给人工（LOGIN_REQUIRED），绝不绕过。
- **状态机**：idle→launching_browser→opening_target→locating_input→submitting→waiting_response→extracting→completed；异常 login_required/locator_not_found/response_timeout/browser_crashed/challenge_detected/cancelled。10 个 AUTOMATION_* 错误码（中文+代码+阶段），失败自动落盘 runtime/automation-artifacts/<invocation-id>/{screenshot.png,page.html,failure.json}。
- **UI 集成**：中央大屏「网页自动化」卡（[自动发送给 ChatGPT] Primary + [切换人工中继] fallback + 执行进度 + 失败原因与重试）；app/js 零网络纪律保持——app 侧 AutomationBridge no-op 占位，真实 fetch 在 automation/ui/automation-ui.js（localhost 由 static-server 注入，file:// 不加载）。
- **测试**：Offline Automation **14/14**（Fake AI Page：tests/fixtures/fake-ai-page.html，A01..A12b 覆盖启动/定位/输入/发送/条件等待/提取/Result 返回/不自动进 Message/登录墙/证据落盘）；Node 185/185 + Browser 99/99 零回归；server 冒烟（health/注入/202/404）PASS。Live ChatGPT E2E：NOT VERIFIED（人工验收步骤见 reports/d3-web-automation-poc.md §6）。
- **未决项**：影刀可行性审计未执行（无 web 调研工具；审计通过前不实现 YingDaoDriver，登记后续轮次）；真实 ChatGPT 生成参数需实机微调。
- 新增 `reports/d3-web-automation-poc.md`；同步 file-tree.md；runtime/browser-profile 与 automation-artifacts 加入 .gitignore。
- **状态**：`WEB_AUTOMATION PoC: IMPLEMENTED · Offline 14/14 · Node 185/185 · Browser 99/99 · Live ChatGPT 人工验收待执行`。

## D3 · WEB_RELAY — 六席会议控制台重构（Six-Seat Console）— 2026-08-08

- **目的**：把「三栏表单型页面」重构为「会议室操作台」——左右六席摘要卡（A 支持侧 / B 质疑侧）+ 中央唯一操作大屏 + 底部时间线。用户裁定：席位可配置但配置表单不长期铺开，详细配置进中央大屏；底层仍跑 D3 单席位 WEB_RELAY（不做 D4 多 Agent 并发调度）。自动测试基线：Node 179/179、Browser 72/72。
- **六席布局**：`280px / minmax(0,1fr) / 280px`（≥1440）；席位卡 = 摘要卡（编号/角色/模型/引用/传输/立场/状态/当前轮次 + 选中/编辑/打开网页）；中央大屏双模式（会议运行 / 席位配置）显隐切换；会议配置卡常驻（无会议=可编辑表单+创建按钮，有会议=冻结摘要）；右栏席位下方会议摘要窄卡；底部时间线/审计日志折叠区 + 开发工具条。
- **SeatLayout（新）**：六席纯逻辑（SEATS 顺序 A1..A3/B1..B3、立场默认 A→支持/B→反对、mapParticipants 映射稳定、stance 覆盖表、sixSeatParticipants 六席默认模板——A1=web_relay+chatgpt-web）。
- **席位本地配置（新，SeatLocalConfig）**：立场（stance）与备注（note）属席位级本地 UI 配置，**不污染 Participant Schema**；创建后仍可修改（web_url/显示名/立场/备注可改，role/model_ref/transport_kind 冻结）。
- **中央大屏模式**：创建会议/加载 Demo 后默认进入「会议运行」；点席位卡「编辑」进入「席位配置」；「会议配置」以常驻卡实现（方案 Task3 三模式语义等价，避免占整屏）。
- **测试**：Node **185/185**（179 零回归 + TEST-155..160：六席顺序/映射/立场覆盖/seat↔participant 双向/六席模板建会 topic 入 Packet）；Browser **86/86**（72 零回归 + S01..S14：六席卡数/左右 3 席/中央大屏宽度/底部折叠区/点击席位进配置/web_url 与显示名可编辑/创建前后冻结/当前席位高亮/议题入 Prompt/response+accept 流程）。
- **契约兼容**：72 项基线全部 id（mt-*/relay-*/cfg-*/capabilities/runtime-status/project-bar/tab-btn-* 等）保留；删除 config-participant.js/status-panel.js（被 SeatColumn/SeatConfigFields 取代）。
- 新增 `reports/d3-six-seat-console.md`（A01..A10 真机验收 IPO 清单）；同步 file-tree.md。
- **状态**：`D3 · 六席会议控制台: IMPLEMENTED · Node 185/185 · Browser 86/86 · 人工真机验收 A01..A10 待执行`。

## D3 · WEB_RELAY — 会议控制台整改（Console Refactor）— 2026-08-08

- **目的**：把「纵向堆卡片的 Developer Harness 测试页」整改成真正可用的三栏桌面会议控制台。用户裁定：不再小修 CSS，整体重做操作壳。自动测试基线：Node 169/169、Browser 56/56（用户真机复跑）。
- **Schema 最小变更（Stop Condition #1 处置，用户批准方案 A）**：`meeting.schema.json` 新增 `topic`（optional 1–2000）、`instruction-packet.schema.json` 的 `meeting` 对象新增 `topic`、`manifest.sha256.json` 同步哈希；数据链 `Draft → Meeting.topic → packet.meeting.topic → Prompt「## 会议议题」段` 完整贯通；**严格只加 topic**（未顺手加 goal/agenda/description），Runtime 核心职责零改动；空议题不落字段（避免 minLength:1 违规）。
- **三栏布局**：`320px / minmax(0,1fr) / 320px`（≥1440）；1024–1439 右栏降底；<1024 单栏。左栏会议配置（名称/议题/议事规则/与会者模型配置/创建会议），中栏当前执行 + Prompt/Response 大工作区（min-height 220px 占满中栏），右栏会议状态 + 步进/人工裁定/存档按钮，底部时间线/审计日志折叠区；顶栏项目条压缩（项目：AI-Council ✅ [更换]）+ IndexedDB 记住上次项目名（file:// 安全模型无法自动恢复读取 → 「上次项目：X [重新授权]」）。
- **MeetingDraft（新）**：创建前草稿模型（title/topic/protocolId/participants），**不是事实源**——创建后核心配置冻结，Runtime 不回读 Draft；Demo（Mock/Relay）降级到「开发工具」独立区块，主操作只有「创建会议」。
- **WebRelayTargetProfile（新）**：web_url 属 Transport 配置（**不污染 Participant Schema**，audit 确认 `additionalProperties:false` 本就禁止）；默认 ChatGPT/Claude/Gemini 三 Profile，Participant 只引用 `model_ref`；「打开模型网页」=`window.open(url)`，仅 http/https、空/非法 URL 按钮禁用（C06/C07 测试）。
- **Validation 折叠**：普通状态单行「校验通过/失败 + 错误码」，V01–V05 折叠进「查看校验详情」；内部状态小字单列；完整运行状态可折叠。
- **测试**：Node **179/179**（新增 TEST-145/146 议题数据链、TEST-147..154 Draft/Profile 模型）；Browser **72/72**（原 56 零回归 + C01..C16 控制台新增：议题可编辑/创建后冻结/URL 可编辑/打开参数正确/三栏存在/Prompt 工作区 ≥500px/Demo 退出主操作区/默认会议 Tab）；Schema 验证 PASS。run-browser.js 的 D1 段开头加一次显式切回「议事规则」Tab（默认 Tab 已按方案改「会议」，断言零改动）。
- **已知取舍（如实报告）**：① 开发工具默认展开（56 基线直接点击 Demo 按钮的可见性契约使「默认折叠」不可行，取独立次级区块妥协）；② 上次项目只记名不自动恢复（file:// 安全模型）；③ 默认 Tab 改「会议」。
- 新增 `reports/d3-console-refactor.md`（A01..A12 真机验收 IPO 清单）；同步 file-tree.md。
- **状态**：`D3 · 会议控制台整改: IMPLEMENTED · Node 179/179 · Browser 72/72 · 人工真机验收 A01..A12 待执行`。

## D3 · WEB_RELAY — 中文 UI + 浏览器测试补齐 + 测试治理 — 2026-08-08

- **目的**：Manual Relay 真机收口的最后一轮——WebRelay 红叉根因修复、全量 UI 中文化、浏览器测试从 0 补到 25 条（B01..B25）、145 行测试文件治理拆分。**机器合同保持英文，用户界面全面中文。**
- **WebRelay 红叉根因**：`index.html` 未装配 `web-relay-actions.js` / `web-relay-view.js` / `ui-text.js` / `meeting-state.js` / 全部 `invocation/*` 脚本 → `A.WebRelayController` / `A.RelayFlow` / `A.WebRelayView` 在能力灯渲染时为 `undefined` → ❌。修复：补齐全部缺失 `<script>` 标签（共 50 个脚本，0 缺失 0 孤立）。
- **能力灯语义冻结**：只表示「模块是否成功装载」，与是否已选目录 / 是否已建会议无关。运行进度由独立「当前状态」行表达（`#runtime-status`），绝不用红叉表示「还没开始」。
- **新增 `app/js/ui/ui-text.js`（94 行）**：UI 中文文案单一来源。`TERM` / `RELAY_STATE` / `MEETING_STATUS` / `CHOICE` / `TRANSPORT` / `ERROR` 六张映射表 + `term()` / `relayState()` / `meetingStatus()` / `choice()` / `transport()` / `error()` 六个查询函数。**机器状态值不经此文件**——Schema enum / class name / file name / `transport_kind` / `waiting_external` 等保持英文。
- **状态映射表（机器→中文）**：created→已创建 / waiting_external→等待外部 AI 回答 / response_received→已收到外部 AI 回答 / validated→校验通过 / accepted→已接受并写入会议 / rejected→已拒绝 / failed→执行失败 / cancelled→已取消。
- **错误码人话**：`web-relay-actions.js` 的 `fail(r)` 把诊断码翻成 `UIText.error(code)` 中文解释 + `（错误代码：CODE）`，禁止 alert、禁止静默失败。
- **Copy Prompt 语义修正**：不使用 Clipboard API（零权限申请），按钮文案为「选中全部提示词」（focus+select），非「复制 Prompt」。
- **过期 D2-F1 文案清理**：`index.html` 顶部从 `D2-F1 Integration Harness` → `AI 顾问委员会 · 开发验证台` + 徽标 `人工网页中继`；footer 重写为运行规则 + 当前能力（含网页中继）；`app.js` 状态栏文案全中文（`Available` → `可用规则`、`Invalid` → `已隔离`、`Session` → `会话`）；CSS 注释、`registry-view.js`、`meeting-runtime-view.js`、`compiler-view.js`、`compiler-packet-view.js`、`participant-binding.js` 均清理过期文案 + 补中文空状态。
- **145 行测试文件治理**：`protocol-test-cases-web-relay-flow.js`（145 行）拆为 `…-flow.js`（67 行，WR-01..05 生命周期）+ `…-recovery.js`（98 行，WR-06..13 持久化与集成）。测试 ID 不变、Node 总数不变（169）。
- **浏览器测试补齐**：`run-browser.js` 从 233 行重写为含 D3 Manual Relay B01..B25 的完整版。修复 D1/D2 断言适配中文状态文本（`#mt-status-raw` 取机器值、`可用规则/已隔离` 替换 `Available/Invalid`、能力灯 5→6）；新增 25 条 D3 断言覆盖中文 UI 审计 / 能力灯 / 空状态 / 中继生命周期 / V01–V05 校验 / 状态映射 / 接受写入 / 空响应拒绝 / 取消。
- **`web-relay-view.js` 行数治理**：从 107 行压缩至 92 行（合并 var 声明、压缩 helper、去冗余注释），回归 ≤100 红线。
- **测试断言更新**：TEST-129 从检查 `D2-F1 Integration Harness` 改为检查中文标题 + 徽标 + 6 能力灯 + 过期文案归零；TEST-131 从 `includes("Meeting")` 改为 `includes("创建会议")`。
- **验证**：Node **169/169 PASS**（零回归）；Script Assembly PASS（50 脚本 0 缺失 0 孤立）；Dead Reference PASS；Line Audit PASS（`web-relay-view.js` 92 行回归 ≤100）。**Browser Gate：NOT VERIFIED（沙箱无 Playwright，B01..B25 + A01..A10 待开发机复跑）**。
- **新增**：`app/js/ui/ui-text.js`（94）、`app/tests/protocol-test-cases-web-relay-recovery.js`（98）、`reports/d3-web-relay-acceptance-checklist.md`。
- **修改**：`index.html` / `app.css` / `app.js` / `harness-shell.js` / `meeting-runtime-view.js` / `meeting-actions.js` / `web-relay-actions.js` / `web-relay-view.js` / `compiler-view.js` / `compiler-packet-view.js` / `participant-binding.js` / `registry-view.js` / `protocol-test-cases-harness.js` / `protocol-test-cases-web-relay-flow.js` / `run-node.js` / `run-browser.js`。
- **状态**：`D3 · WEB_RELAY: IMPLEMENTED + 中文 UI · Node 169/169 PASS · Browser Gate: NOT VERIFIED · 不得宣布 CLOSED 直至开发机复跑 Browser B01..B25 + 人工验收 A01..A10`。

## D3 · WEB_RELAY — Manual Relay（实现完成，Browser Gate NOT VERIFIED）— 2026-08-08

- **目的**：把系统从「只能跑 Mock 会议」推进为「能接一个真实外部 AI 的回答并写进会议」，但**系统绝不自动相信外部 AI**。四道闸门：①复制 Prompt → ②粘贴 Response → ③V01–V05 硬校验 → ④Accept 后才落成正式会议消息 → Runtime 继续。对应最初验收标准：复制 Prompt 给你、你粘回回答、校验并经 Accept 后才写入会议、Runtime 继续。
- **新增 6 个文件（核心均 ≤100 行）**：
  - `app/js/invocation/agent-web-relay-controller.js`（56）：Manual Relay 协调层 open/receive/validate(V01–V05)/accept/reject/retry/cancel/hydrate/state/sessions；无 DOM、无网络、不生成 Prompt。
  - `app/js/invocation/invocation-message-factory.js`（43）：把**已 Accept** 的 Result 落成正式 Meeting Message（`accepted_by_runtime=true`、`validation.status:"valid"`）；绝不凭空生成事实。
  - `app/js/harness/relay-flow.js`（82）：CompileFlow（Prompt 生成）↔ WebRelayController 接合；`routeStep` 供 step 委托停下；`createRelayDemo` 造 web_relay 演示会议；依赖项统一调用时取 `A.*`（修复 Node 加载顺序敏感）。
  - `app/js/ui/harness/web-relay-view.js`（57）：面板渲染（readonly Prompt + 复制、粘贴框、V01–V05 清单、接受/拒绝/重试/取消按钮启用规则）。
  - `app/js/ui/harness/web-relay-actions.js`（37）：面板点击行为，模块内持有 handle/最近校验结果。
  - `app/tests/protocol-test-cases-web-relay-flow.js`（145）：WR-01..13 流程测试（含 Save/Load 断点续传、cancel、retry、V05 参与者移除、nextRelay 跳过 mock、step 路由、accept 写 messages）。
- **修改 6 个文件（接线点，均 ≤100）**：`meeting-step-flow.js`(98，step 路由 web_relay 停下) / `harness-shell.js`(73，能力灯 WebRelay + Meeting Tab 内嵌 WebRelayView) / `meeting-actions.js`(80，新增 `createRelay` + `load` 后 `hydrate`) / `meeting-runtime-view.js`(86，新增 Create Relay Demo 按钮) / `index.html`(加 3 个 script) / `run-node.js`(RUNTIME + AUDITED 注册)。
- **红线（用户裁定，已落实）**：Runtime 不知道 ChatGPT（代码中无 ChatGPT/Claude/OpenAI/browser 概念，仅有 `web_relay` transport_kind）；AI 回答不直接成为会议事实（必经 validate→accept，无 `Paste→messages.push` 捷径）；Human Gate 仍不是 Transport（`waiting_human` 时 WEB_RELAY 完全停下，web_relay 命中时 `step` 返回 `{ok:false, reason:"web_relay"}`）。
- **校验语义（复用冻结错误码，不新增）**：V01 句柄有效(STALE_INVOCATION) / V02 状态机在 response_received / V03 原文非空(EMPTY_RESPONSE) / V04 长度≤20000(INVALID_RESPONSE) / V05 参与者仍在会议(PARTICIPANT_NOT_FOUND)。
- **断点续传**：运行态存 `meeting.state_data.web_relay`（additionalProperties:true），Archive/Restore 往返后 `WebRelayController.hydrate` 灌回 transport 内存 `_store`。**Schema 零改动**（复用既有 event_type / participants.transport_kind / state_data 开放袋）；Event Log 复用 `agent_output_received`，不新增枚举（延续 D3-D0-F1 移除 invocation_waiting 的治理）。
- **测试**：自动测试由 **156 项增至 169 项（169/169 PASS，原 156 零回归）**，新增 13 项 WR 流程测试；Contract 12/12、Line Audit、Dead Reference、Script Assembly、Schema/Manifest 均 PASS。**Browser Gate：NOT VERIFIED（沙箱无 Playwright，`run-browser.js` 含 B01..B20 待开发机复跑）**。
- **状态**：`D3 · WEB_RELAY: IMPLEMENTED · Node 169/169 PASS · Contract 12/12 PASS · Browser Gate: NOT VERIFIED · Blocking Issues: 1（Browser）· 不得宣布 CLOSED 直至开发机复跑 Browser + 人工验收 A01..A10`。6 条 Stop Condition 均无触发。
- 新增 `reports/d3-web-relay-manual-relay.md`；同步 `file-tree.md`、`changelog.md`。commit：`feat: implement manual web relay`（待 push）。

## D3-D0-F2 — Browser Gate Closure（最终收口，D3-D0 CLOSED）— 2026-08-08

- **背景**：用户在正式开发机真实执行 `node app/tests/run-browser.js`，得 **29/29 PASS**（真机 Chrome，非静态审计、非预计）。据此把 Browser Gate 由 `NOT VERIFIED` 翻为正式 `PASS`，唯一 Blocking Issue 清除。本轮**仅做仓库收口，无任何功能开发**，禁止自动进入 D3-R1。
- **依赖正式化**：`app/tests/run-browser.js` 正式依赖 `playwright-core`，已写入 `devDependencies`（`^1.62.1`）+ 保留 `package-lock.json`；新增 `.gitignore` 忽略 `node_modules/`（依赖经 `npm install` 恢复，不入库）。新开发机可 `npm install` 直接恢复 Browser Gate 依赖。
- **验证（F2 后新鲜复跑）**：`run-node.js` **156/156 PASS**（零回归）；Browser Gate **29/29 PASS**（D1 Protocol / D2-F1 Integration / D1 nested test page 均无浏览器回归）；Script Assembly / Dead Reference / Schema·Manifest / Line Audit 均 PASS；Git clean（HEAD == origin/main 0/0，`node_modules/` 已忽略）。
- **状态**：`D3-D0-F2: PASS · D3-D0: CLOSED · WEB_RELAY Contract: FROZEN · Browser Gate: PASS · 29/29 · Blocking Issues: 0 · Recommendation: ENTER D3-R1`。`NOT VERIFIED` 第三态纪律保留为项目长期规则（本次反向验证其价值：初版非测试失败，而是缺依赖；补齐后直接 29/29）。
- 更新 `docs/d3-web-relay-contract.md`（§14 D3-D0-F2 最终收口 + 状态翻 PASS）、`changelog.md`、`file-tree.md`、`.gitignore`。

## D3-D0-F1 — Closure Gate Fix（门禁与治理修复，已由 D3-D0-F2 翻为 CLOSED）— 2026-08-08

- **背景**：D3-D0 架构方向获认可，但 Closure Gate 不完整，裁定 **D3-D0 KEEP OPEN**，禁止进入 D3-R1。本轮只修门禁与治理问题，不改架构。
- **门禁纠正**：D3-D0 初次提交宣布 `D3-D0: PASS` 证据不足——`run-browser.js`（Playwright 真机 29/29）在开发沙箱**未执行**（Playwright 缺失，且 safe-delete 拦截浏览器下载）。固化规则：**「未执行」= NOT VERIFIED，既非 PASS 也非 FAIL**。
- **行数治理（单文件 ≤100 红线的明确例外已记录）**：`agent-transport-adapter.js`(167) 含 3 职责 → 拆为 `agent-transport-adapter.js`(抽象) + `agent-mock-transport.js` + `agent-web-relay-transport.js`（均 ≤100）；`protocol-test-cases-web-relay.js`(169) 拆为 `…-contract.js`(D3D0-01..08) + `…-state.js`(D3D0-09..12)（均 ≤100，测试 ID 不变）；`agent-invocation-request.js`(106) 单一职责，**批准 ≤110 明确例外**。拆分不改变合同语义，`A.TransportAdapter` 命名空间与 `create(kind)` / `MockTransport` / `WebRelayTransport` 引用路径保持。
- **Event Enum 审计**：移除初版误加的 `invocation_waiting`（仅为 `created → waiting_external` 可推导的内部状态迁移，不携带独立会议级信息），保留 `invocation_created` / `invocation_cancelled`；同步 `meeting.schema.json`、`manifest.sha256.json`（meeting.schema.json 现 9249 字节）、`docs/d3-web-relay-contract.md`。无任何 JS/测试引用该值，零行为影响。
- **验证（F1 后）**：`run-node.js` **156/156 PASS**（含拆分后 12 条合同测试，零回归）；脚本装配静态审计（TEST-129）PASS；Dead Reference PASS（无旧文件名 / invocation_waiting 残留）；Schema JSON / Manifest 一致 PASS；Line Audit PASS（≤110 例外已记录）。**Browser Gate：NOT VERIFIED（沙箱无法补跑）**。
- **状态**：`D3-D0: KEEP OPEN · WEB_RELAY Contract: FROZEN（合同已冻结）· Browser Gate: NOT VERIFIED · Blocking Issues: 1`；待人工在具备 Playwright 环境复跑 `node app/tests/run-browser.js` 确认 29/29 后，方可宣布 D3-D0 CLOSED。禁止自动进入 D3-R1。
- 更新 `docs/d3-web-relay-contract.md`（§13 D3-D0-F1 状态更正 + 行数/Event 审计）、`file-tree.md`、`changelog.md`。

## D3-D0 — WEB_RELAY Contract Freeze（合同冻结，D3 第一步）— 2026-08-08

> ⚠️ **状态更正**：本条目初版结论「D3-D0: PASS / Blocking Issues: 0」证据不足（Browser Gate 未执行）。正确状态见上方 D3-D0-F1。下文保留历史事实，仅修正行数与枚举描述。

- **目的**：冻结「服务于 Manual WEB_RELAY 的最小 Transport 合同」，证明闭环 Meeting Runtime → InstructionPacket → Renderer → 外部 Web AI → Response → Validation → 写回 → Runtime 继续 的确定性合同，把系统从 Mock 会议模拟器推进为真实 AI 会议系统。本轮**只冻结合同**，不实现 Manual Relay UI（D3-R1）、不实现自动校验（D3-R2）、不接真实 LLM、不预实现 api/local/web_automation。
- **新增 `app/js/invocation/`（5 份纯数据合同，JSON-safe、浅冻结，不发起任何网络请求；D3-D0-F1 将 167 行的 `agent-transport-adapter.js` 拆为抽象 + `agent-mock-transport.js` + `agent-web-relay-transport.js`）**：
  - `agent-invocation-request.js`：`AgentInvocationRequest.create/validate`，字段集严格冻结；`request_id = req-` + FNV-1a32(canonical{meeting,phase,participant,packet}) + `-` + 2 位 sequence（按目标内容寻址、prompt 不影响、sequence 改变）；`metadata` 禁止供应商/UI 专有字段。
  - `agent-invocation-result.js`：`AgentInvocationResult.create/validate`，4 状态（success/failure/cancelled/needs_human_refill）；**红线 Result ≠ 正式 Message（无 message_id）**；success 必带 raw_response、failure/cancelled 必带 error。
  - `agent-web-relay-state-machine.js`：`WebRelayStateMachine`，8 态 + 冻结转移表 + `replay()` 重放恢复（断点续传 / 审计）。
  - `agent-transport-adapter.js`（抽象接口 + `create` 工厂）/`agent-mock-transport.js`（`MockTransport`，确定性）/ `agent-web-relay-transport.js`（`WebRelayTransport`，状态机驱动，begin/receive/validate/accept/reject/cancel/retry/getState）：工厂仅放行 mock/web_relay，api/local/web_automation → `TRANSPORT_KIND_UNSUPPORTED`。
- **错误模型**：`protocol-diagnostic.js` 追加 10 个 D3-D0 码——7 个 WEB_RELAY 业务错误（EMPTY_RESPONSE/INVALID_RESPONSE/VALIDATION_FAILED/CANCELLED/TRANSPORT_FAILED/STALE_INVOCATION/PARTICIPANT_NOT_FOUND）+ 3 个合同完整性错误（INVOCATION_REQUEST_INVALID/INVOCATION_STATE_TRANSITION_INVALID/TRANSPORT_KIND_UNSUPPORTED），两组语义刻意分开。
- **审计事件**：`meeting.schema.json` 的 `event_type` 枚举追加 2 个真正新的（`invocation_created` / `invocation_cancelled`），`invocation_waiting` 经 D3-D0-F1 审计确认为可推导内部状态后移除；其余复用既有 `agent_output_received` / `message_accepted` / `message_rejected` / `transport_error`；`manifest.sha256.json` 同步刷新 meeting.schema.json 的哈希（9249 字节）。
- **测试**：新增 `app/tests/protocol-test-cases-web-relay-contract.js`（D3D0-01..08，合同结构组）与 `app/tests/protocol-test-cases-web-relay-state.js`（D3D0-09..12，状态机/Transport 组，D3-D0-F1 由 169 行单文件拆分），共 12 项，覆盖 Request 成功/拒供应商字段/缺 participant/非法 kind/request_id 寻址、Result 无 message_id/一致性/拒供应商字段、状态机合法链路与非法转移+replay、工厂放行边界、WebRelayTransport 端到端 Manual Relay 生命周期。`run-node.js` 把 `invocation/*` 纳入 RUNTIME 与 AUDITED、把合同测试纳入执行；`index.html` 装配 5 个新 `<script>`。自动测试由 **144 项增至 156 项（156/156 PASS，原 144 零回归）**；脚本装配静态审计（TEST-129）通过。
- **不做的范围**：OpenAI/Anthropic/Gemini API、Local LLM/Ollama、浏览器自动化（Playwright 控制 ChatGPT/Selenium/Chrome Extension）、WEB_AUTOMATION、正式六席会议室 UI、多 Agent 并行调度（D4）、具体 Response Validation（D3-R2）、真实闭环接线（D3-R1）。
- **门禁（初版证据不足，见 D3-D0-F1）**：`run-node.js` 156/156 PASS；`run-browser.js`（Playwright 真机 29/29）在开发沙箱**未执行**（Playwright 缺失且 safe-delete 拦截下载），故初版 `D3-D0: PASS` 结论证据不足，已更正为 `D3-D0: KEEP OPEN · Browser Gate: NOT VERIFIED`。
- 新增 `docs/d3-web-relay-contract.md`；同步 `file-tree.md`。

## D2-F1 — Developer Harness Integration（接线，不做六席会议室 UI）— 2026-08-08

- **目的**：把已完成的 Protocol Kernel / Meeting Runtime / Persistence-Restore / Instruction Compiler / Prompt Renderer 接进同一个浏览器 Harness，做到「点得到、看得到、验得到」。本轮**只做接线**，不开发 D3 Transport、不接真实 LLM、不做正式六席会议室 UI。
- **新增 `app/js/harness/`（无 DOM 流程层，可在 Node 直接测试，每文件 ≤100 行）**：
  - `harness-store.js`：共享状态 + 订阅；`setSession` 从 `snapshot.assetFiles` 冻结装入 Role Card 库 / Schema Pack / Packet Schema；`setMeeting` / `availableProtocol`。
  - `participant-binding.js`：`options()` 只从 `meeting.participants[]` 生成下拉（标注当前 Phase 的 actor 目标）；`compilerState()` 无 Meeting 时返回禁用 + 指向 Meeting 页的理由；`defaultParticipantId`。
  - `meeting-step-flow.js`：Create Demo **只 createMeeting + start 不预跑**；`step()` 委托 `MockAgentRuntime.stepOnce` 单步；`humanGateState` 仅 waiting_human + await_human_decision 启用；`decide` 提交人工决策；Battle 在未选人时确定性默认全部 advisor 升序并如实告知。
  - `compile-flow.js`：`run()` = compile →（Packet Schema 校验）→ render，返回 8 字段摘要 / Raw JSON / Rendered Prompt。
  - `archive-flow.js`：`buildArchive` / `restoreFrom`（Schema + Restore 语义校验 + 原子恢复）。
- **新增 `app/js/ui/harness/`（视图层，只画不判规则，每文件 ≤100 行）**：
  - `harness-shell.js`（能力灯 Protocol/Runtime/Persistence/Compiler/Renderer + 三 Tab 切换 + 订阅 Store 全量重绘）、`meeting-actions.js`、`meeting-runtime-view.js`、`compiler-view.js`、`compiler-packet-view.js`（Rendered Prompt 用**只读 textarea**，Ctrl+A/Ctrl+C 复制，刻意不调 Clipboard API 以保 local-first）。
- **接口/数据冻结变更**：
  - `protocol-file-source.js`：新增 `ASSET_PATH` 并 freeze `snapshot.assetFiles`（Role Card / Schema 等资产一并冻结，无热加载）。
  - `role-card-registry.js`：新增 `byRoleId` 与 `resolveForParticipant`（role_id 精确命中 → role_class 回退）。
  - `instruction-compiler.js`：Role Card 解析优先走 `resolveForParticipant`，错误码含 role_id 与 role_class（落实 **Role ≠ Participant**）。
  - `mock-agent-runtime.js`：新增 `stepOnce`（单步语义，明确拒绝 `await_human_decision`）。
  - `roles/`：新增 `strategic-advocate.json` / `risk-challenger.json` 两张正式 Role Card（现共 4 张）。
- **UI 重排**：`index.html` 改为「能力灯 + 选择目录 + Protocols / Meeting / Compiler 三 Tab」，徽标 `D2-F1 Integration Harness`，脚注声明范围；删除 D1-R4 的 `meeting-persistence-ui.js`；`app.js` 在 `rebuild()` 后把 Session 交给 `HarnessStore`。
- **测试**：新增 `app/tests/protocol-test-cases-harness.js`（TEST-129..144，共 16 项），覆盖脚本装配 / 冻结 / 无 Meeting 禁用 / Mock 单步 / Human Gate 拦截 / Battle 确定性 / 编译端到端 / 切换重编译 / **Role ≠ Participant 契约** / Save-Load 往返。`run-node.js` 把 `harness/*` 纳入执行、`ui/harness/*` 纳入静态审计。自动测试由 **128 项增至 144 项（144/144 PASS，原 128 零回归）**。`run-browser.js` 扩展为 D1 Protocols + D2-F1 Meeting/Compiler 真实点击链路验收（A01..A15 关键点 + 截图）。
- **不做的范围**：D3 Transport / 真实 LLM / 正式六席会议室 UI / Battle 人工选人 UI（本轮 Battle 走确定性默认）。

## D2-A1 — Integration Closure Audit（closure 审计，建议 D2 CLOSED）— 2026-08-08

- **目的**：确认 D2 是否具备正式 CLOSED 条件。约束：不新增功能 / 不进 D3 / 不做 Transport / 不做六席 UI。
- **审计结果全绿**：Git 基线（main@`3de8210`，与 origin/main 0/0，worktree clean）· Node `run-node.js` **144/144 PASS**（原 128 零回归）· Browser `run-browser.js`（chrome 真机）**29/29 PASS**。
- **浏览器计数澄清（纠正上轮误导）**：29 为**外层驱动断言数** = `runD1`(9) + `runD2F1`(19) + `runTestPage`(1)。其中 `runTestPage` 的 1 条外层断言会打开 `test-runner.html`、其内部运行 **15 条内层用例**（15/15）——15 是嵌套在 1 个外层断言内的内层结果，正确等式为 **29 = 9 + 19 + 1**，而非 9 + 19 + 15。已同步修正 `d2-f1-report.md` 第 85 行。
- **Script 装配审计**：`index.html` 与 `test-runner.html` 均无漏装 / 顺序错 / 死引用 / 重复；`protocol-semantic-validator.js`（D1-R2 遗留漏装）在两页均已装载。
- **>100 行文件审计**：7 个 D1 文件（`meeting-runtime.js`274 / `prompt-renderer.js`249 / `protocol-semantic-validator.js`240 / `instruction-compiler.js`188 / `meeting-restore-validator.js`155 / `protocol-registry.js`133 / `protocol-diagnostic.js`117）均为单一职责、仅篇幅偏长，登记技术债、**不阻塞 D2 CLOSED**、不机械拆文件。
- **边界审计**：Role Card ≠ Participant ≠ Model 三不混（Compiler 可选对象只来自 `meeting.participants[]`，经 `resolveForParticipant` 取角色卡；`MockAgentRuntime` 仅测试路径）；Protocol 不持模型实现、Meeting Runtime 不绑模型 API。
- **D3 前置兼容**：D3 可由 `pendingAction` 零侵入派生 `AgentInvocationRequest`，Runtime 核心数据模型**无需改动**，向前兼容。
- **Blocking Issues = 0**。**D2-A1: PASS · Recommendation: D2 CLOSED**。
- 新增 `reports/d2-a1-closure-audit.md`；工作区干净、已提交推送后停止，不自动进入 D3。

## D1-R1-F1 — Protocol Registry 收口修复 — 2026-08-07

- 修复切换项目目录后旧 Schema Override 跨目录残留的问题（F01）。
- 增加 Schema Override Session 生命周期回归测试（TEST-13 / TEST-14 / TEST-15，自动测试 12 → 15 项）。
- 删除已废弃的 C# 探索实现（`AI-Council.slnx` / `src/` / `tests/`）与 `.gitignore` 中 `.NET` 段，正式仓库仅保留 HTML/CSS/JavaScript。
- 更新 `file-tree.md`，使导航统一指向 HTML/CSS/JavaScript 正式实现。
- 修正 D1-R1 报告中文件统计（22 个新增文件）与 Git 状态（cf13050 / ef3a257）。

## D1-R2 — Protocol Semantic Validator — 2026-08-07

- 新增 `app/js/protocol-semantic-validator.js`：对通过 JSON Schema 校验的 Protocol 做确定性语义校验（100% deterministic，无 LLM）。
- 语义规则：Phase ID 唯一性、initial_phase_id 存在性、Transition target 存在性、Human Gate actor/completion 合规、Phase 可达性、$end 可达性、Side 唯一性/数量/总容量、Required Role 唯一性/数量、Advisor 与 participant_policy 一致性、Default Visibility 合法性。
- Registry 在 Schema PASS 后追加 Semantic Gate：Semantic 失败进入 Quarantine 并携带 Semantic Diagnostic Code；合法循环允许，仅需至少一条路径抵达 $end。
- 自动测试由 15 项增至 31 项（新增 TEST-16..TEST-31，覆盖每个语义规则及多错误一次返回）；原 15 项无回归。
- 正式 `protocol.schema.json` 未修改；无 D1-R3 / D2 范围外实现。

## D1-R3 — Meeting State Machine / Deterministic Runtime — 2026-08-07

- 新增 `app/js/meeting-state.js`：Meeting 状态模型 + 错误模型（`STATUS` / `markFailed` / `recordCompletion` / `isActive`）。
- 新增 `app/js/meeting-action.js`：Pending Action 构造（`collect_responses` / `await_human_decision`），`Runtime.getNextAction` 回答「下一步合法动作」。
- 新增 `app/js/meeting-factory.js`：仅从 Available Protocol + config 经 `MeetingFactory.createMeeting` 创建会议（status=initialized）。
- 新增 `app/js/meeting-runtime.js`：核心确定性引擎（`start` / `drive` / `submitResult` / `submitHumanDecision` / `resolveTransition` / `resolveParticipants`）；含 `MAX_INTERNAL_STEPS=1000` 安全阀；多候选 transition 确定性失败 `RUNTIME_AMBIGUOUS_TRANSITION`，绝不偷偷选数组第一项。
- 新增 `app/js/mock-agent-runtime.js`：测试用 Mock Agent 一键推进整张 Phase Graph。
- 新增 `app/tests/protocol-test-cases-runtime.js`：TEST-32..TEST-53（22 项），覆盖创建/启动/all_selected_respond/重复提交/Secretary/Critique/Human Gate 阻塞/Finish→$end/合法循环/非法 choice/Battle 选择/Battle 缺 selection/各 actor selector/System 自驱/$end/Ambiguous Transition/Step Limit/E2E Finish/E2E Continue+Battle。
- 在 `protocol-diagnostic.js` 冻结 10 个 `RUNTIME_*` 诊断码（复用既有 ProtocolDiagnostic 体系）。
- `index.html` 加载 5 个新脚本、页眉/脚注更新为 D1-R3；`run-node.js` 的 RUNTIME / AUDITED 增加 D1-R3 模块与测试文件。
- 自动测试由 31 项增至 53 项（53/53 PASS）；无 LLM、无 Prompt 编译、无持久化/恢复/回放（属 D1-R4）、无 Checkpoint/Restore/Replay/WebRelay（属 D2）；正式 `protocol.schema.json` 未修改。

## D1-R4 — Event Log / Checkpoint / Single JSON Persistence / Restore — 2026-08-07

- 新增 `app/js/meeting-event-log.js`：Append-only Event Log，`seq` 严格 0..N-1、`event_id = evt-NNNNNN`、时钟可注入（测试确定性）；`meeting.events` 缺失时报 `PERSISTENCE_EVENT_LOG_UNAVAILABLE`。
- 新增 `app/js/meeting-checkpoint.js`：进入 `checkpoint=true` Phase 且状态稳定后自动建检查点；先写 `checkpoint_created` 事件再以其 `seq` 作为 `at_event_seq`；`state_snapshot` 为深拷贝，后续状态变化不污染旧快照。
- 新增 `app/js/protocol-fingerprint.js`：Canonical JSON（键名升序、数组保序、无空白、UTF-8）+ Web Crypto `crypto.subtle.digest("SHA-256")`；Crypto 不可用时报 `PERSISTENCE_CRYPTO_UNAVAILABLE`，绝不伪造哈希。
- 新增 `app/js/meeting-archive.js`：Runtime Meeting → `meeting.schema.json` 存档 DTO；`protocol_snapshot.sha256` 为真实指纹；`messages/artifacts/annotations=[]`、`branch=null`（预留 D2+）。
- 新增 `app/js/meeting-schema-validator.js`：把 meeting/role/message/artifact/annotation 五份 Schema 注册进**同一个** Ajv 2020 实例以解析 `$ref`；缺件报 `PERSISTENCE_SCHEMA_PACK_INCOMPLETE`。
- 新增 `app/js/meeting-restore-validator.js`：恢复前语义校验（Protocol 存在 / 指纹一致 / Phase 存在 / 事件序号连续 / 事件 ID 唯一 / Checkpoint 指向合法事件 / 参与者 ID 唯一 / 状态一致 / Pending Action 一致），任何一项失败即拒绝，**绝不自动修复坏存档**。
- 新增 `app/js/meeting-persistence.js`：`serialize` / `parse`（失败产出 `PERSISTENCE_JSON_PARSE_FAILED`）/ 浏览器 Blob 下载 / `<input type=file>` 读取；Object URL 惰性回收，不使用任何定时器。
- 新增 `app/js/meeting-restore.js`：存档 → Runtime Meeting 原子恢复（Candidate → Validate → Commit）；恢复后**绝不重新 `start()`**、不重跑已完成 Phase、保留部分响应。
- 新增 `app/js/meeting-persistence-ui.js` 与 `index.html` 持久化面板（Create Demo / Save / Load），仅浏览器加载，不进 Node 测试。
- `meeting-runtime.js` 埋点：`meeting_started` / `phase_entered` / `agent_output_received` / `phase_completed` / `human_decision` / `meeting_completed`；`meeting-state.js` 补 `meeting_failed`。
- `meeting-factory.js`：`seed` 默认值由 `null` 改为确定性 `0`（`meeting.schema` 要求 `integer + minimum:0 + required`，`null` 会产出无法存档的状态）。
- 在 `protocol-diagnostic.js` 冻结 16 个 `PERSISTENCE_*` / `RESTORE_*` 诊断码。
- 新增 `app/tests/protocol-test-cases-persistence.js`：TEST-54..TEST-84（31 项），含 `SAVE → DESTROY → LOAD → CONTINUE → $end` 三条端到端。自动测试由 53 项增至 **84 项（84/84 PASS）**。
- 正式 `schema/schemas/`（6 份）**零修改**；无 Replay / Timeline UI / Branch / Artifact-Annotation Runtime / InstructionPacket / Prompt 编译 / Web Relay / 真实 LLM。

## D2-R1 — Instruction Compiler / Role Card Registry — 2026-08-07

- 新增 `app/js/role-card-registry.js`：按 `role_class` 确定性解析 Role Card（同 class 多卡按 `role_id` 升序 pick 第一张），补 D1-R4 报告 §24-1 的 Role Registry 缺口；与 Model Registry 解耦（Role-Card-Spec §1）。
- 新增 `app/js/instruction-packet-schema.js`：用 `instruction-packet.schema.json`（Draft 2020-12）校验编译产物，复用 `vendor/ajv2020.bundle.js` 与 `SchemaValidator.toDiagnostics`。
- 新增 `app/js/instruction-compiler.js`：确定性 `(Protocol, Meeting, Phase, Participant) → InstructionPacket`；复用 `Runtime._resolveParticipants` 与 `ProtocolFingerprint.canonicalize`；`packet_id` 内容寻址（FNV-1a 32-bit，纯 JS，无 Crypto 依赖）；`generated_at` 可注入时钟；不接 LLM / 不渲染 Prompt / 不接 Transport / 不修改 Runtime。
- 新增 `roles/advisor.json` 与 `roles/chair-secretary.json`：示例 Role Card（符合 `role.schema.json`），供测试与未来浏览器 loader 装载。
- 新增 `schema/schemas/instruction-packet.schema.json`：**新增** Schema（非冻结 6 份之一），`additionalProperties:false`，字段对齐编译产物；已写入 `schema/manifest.sha256.json`。
- 在 `protocol-diagnostic.js` 冻结 7 个 `COMPILER_*` / `ROLE_*` 诊断码（含 `ROLE_CARD_NOT_FOUND` / `ROLE_CARD_INVALID` / `COMPILER_PARTICIPANT_NOT_TARGETED` / `COMPILER_NO_AGENT_TARGET` 等）。
- 新增 `app/tests/protocol-test-cases-compiler.js`：TEST-85..TEST-109（25 项），覆盖确定性 / 内容寻址 / Role Card 解析与拒绝 / 可见性与上下文与输出合同透传 / actor 解析 / 各类拒绝路径 / Schema 校验 / JSON 安全。
- 自动测试由 84 项增至 **109 项（109/109 PASS）**；无 Prompt 编译（D2-R2）/ Transport / Web Relay（D2-R3）/ 真实 LLM；正式 `schema/schemas/`（6 份）**零修改**。

## D2-R2 — Prompt Renderer (InstructionPacket → 人类可读 Prompt) — 2026-08-07

- 新增 `app/js/prompt-renderer.js`：`PromptRenderer.render(packet) → { ok, text?, diagnostics? }`，确定性把 `InstructionPacket` 渲染为人类可读 Prompt 文本；**严格只消费 Packet 字段**，绝不回查 protocol / meeting / role 文件（Packet 即唯一事实来源）。
- 段落结构：协议/会议/阶段头、对外标识（可见性红化）、角色职责（**始终完整渲染**，因 Agent 必知自己的角色——Role-Card-Spec §4）、本阶段任务、上下文范围、可见性规则、输出合同、选中原因、元数据 footer。
- 可见性红化落实 Role-Card-Spec §5 / Council-Constitution §4：`meeting.visibility_mode` 为权威模式；`public` 暴露真实 alias/participant_id/角色/阵营，`semi_anonymous` 隐藏个人 alias 与 ID、保留角色与阵营（底层模型本就不出现在 Packet 中，天然隐藏），`full_anonymous` 仅显示阵营字母 + 确定性代号（A1…A9）、角色与 ID 隐藏；`include_visibility_rules` 仅控制是否渲染「可见性规则」解释段。
- `full_anonymous` 代号由 `participant_id` 经 FNV-1a 32-bit（纯 JS，与编译器同源）派生 `A{n}`，确定性稳定、不泄露真实 ID。
- 在 `protocol-diagnostic.js` 冻结 1 个 `RENDERER_PACKET_INVALID` 诊断码：畸形 packet（null / 缺必填字段 / 字段非对象）/ 未知可见性模式 → 明确拒绝，绝不静默渲染。
- 新增 `app/tests/protocol-test-cases-renderer.js`：TEST-110..TEST-128（19 项），覆盖确定性、三种可见性模式红化差异、角色卡含/缺、可见性规则含/缺、输出合同 text/structured_json、上下文范围、畸形拒绝、actor 透传、元数据 footer、null 模式兜底、Compiler→Renderer 端到端。
- 自动测试由 109 项增至 **128 项（128/128 PASS）**；对 `prompt-renderer.js` 扫描 `openai/anthropic/WEB_RELAY/fetch/WebSocket/setTimeout/PromptCompiler` 等禁止 API **零命中**；无 LLM / 无 Transport（D2-R3）/ 不修改 Compiler / Runtime；正式 `schema/schemas/`（6 份）+ `instruction-packet.schema.json` **零修改**。

## [0.1.0] — D1-R1 Protocol Registry (HTML/JS) — 2026-08-07

技术栈正式冻结为 **HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。

### Added
- `app/`：纯浏览器本地应用，双击 `index.html` 即运行。
- **ProtocolLoader**：`File → 文本 → JSON.parse → Parsed Object`；损坏 JSON 产出 `JSON_PARSE_FAILED`，不崩溃。
- **SchemaValidator**：Ajv 8.20.0（Draft 2020-12）本地 IIFE 打包 `vendor/ajv2020.bundle.js`，加载正式 `protocol.schema.json` 零副本校验；全部错误均收集。
- **ProtocolRegistry**：`Available` / `Invalid`(Quarantine) 分流；坏规则不进 Available 也不静默消失。
- **重复检测**：`protocol_id + version` 唯一；冲突双方均隔离并产出 `DUPLICATE_PROTOCOL`，不依赖文件顺序、不覆盖。
- **Session 冻结（第42题）**：用户选目录后建立 File Snapshot，`Object.freeze()` 注册表，无轮询 / watcher / 定时器 / 自动刷新。
- **坏规则隔离（第43题）**：UI 明确显示文件 / ID / 版本 / 错误码 / JSON Path / 消息。
- 测试：`app/tests/` 下的 JavaScript 自动测试（D1-R1 为 12 项，D1-R1-F1 增至 15 项；Node 命令行 15/15，Chrome/Edge 真机各 10/10）。

### Frozen
- 禁用：C# / .NET / WPF / Avalonia / Java / Python 后端 / Node 后端 / Electron / Tauri / 数据库服务器。
- 正式 `protocol.schema.json` **未修改**。
- 未实现 D1-R2 及之后阶段功能（见下）。

### Not in scope (D1-R1)
- D1-R2 Protocol Semantic Validator（Phase 可达性、Transition target、Human Gate、$end 可达性、Side/Role 数量语义）等。

## [0.1.0-pre] — Phase 0 规范冻结

### Added
- `docs/`：Council 宪法、Protocol 组成、执行协议等 12 篇冻结文档。
- `schema/`：Schema v0.1（`protocol` / `role` / `meeting` / `message` / `artifact` / `annotation`）+ `valid` / `invalid` 示例集 + SHA256 清单。
- `protocols/committee-mvp/protocol.json`：首个示例协议。

### Changed
- 早期以 C#（`.slnx` / `src/` / `tests/`）做技术验证，后路线冻结为 HTML/JS；C# 代码保留为历史参考，不参与 D1-R1 运行。
