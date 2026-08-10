# File Tree — AI 顾问委员会 v0.1

> 最后更新：2026-08-09（MEETING-RUNTIME-F1 发言队列/入会检查/可逆正式发言：Node 236/236 · Browser 327/327 · Offline 14/14）
> 技术栈已冻结：**HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。
> 早期 C# 探索实现（`.slnx` / `src/` / `tests/`）已在 D1-R1-F1 从正式工作树删除，历史保留于 Git；正式实现为纯浏览器 HTML/CSS/JS，无构建产物。

## 顶层

```text
AI-Council/
├── docs/                      # Phase 0 冻结文档（12 篇）
├── schema/                    # Schema v0.1 正式定义 + 示例
├── roles/                     # D2-F1 Role Card 库（4 张，符合 role.schema.json）
├── protocols/                 # 用户协议目录（运行时由浏览器选择）
├── app/                       # ★ D1-R1/R2/R3/R4 + D2-R1/R2 + D2-F1 正式实现（纯 HTML/JS）
├── reports/                   # 开发报告 + 真机验收截图（d1-r1-screenshots/ / d2-f1-screenshots/）
├── file-tree.md               # 本文件
├── GOVERNANCE.md              # ★2026-08-10：开发治理规则（CLOSED 定义 / Git 门禁 / 永久反例）
├── changelog.md
├── package.json               # ★D3-D0-F2：devDependencies 含 playwright-core（run-browser.js 正式依赖）
├── package-lock.json          # ★D3-D0-F2：lockfile（node_modules/ 经 npm install 恢复，不入 git）
└── .gitignore                 # ★D3-D0-F2：忽略 node_modules/
```

## app/（D1-R1 / D1-R2 / D1-R3 / D1-R4 / D2-R1 / D2-R2 / D2-F1 正式实现，核心目录）

```text
app/
├── index.html                 # 双击即运行入口（AI 顾问委员会 · 开发验证台：能力灯 6 个 + 议事规则/会议/指令编译 三 Tab + 独立运行状态行）
├── css/
│   └── app.css                # 浅色简洁样式（含 .tabs / .capability / .runtime-status / .workitem 等）
├── js/
│   ├── app.js                 # 启动编排：选目录 → 建 Snapshot → 初始化 Session → 交给 HarnessStore（D3 中文状态文案）
│   ├── protocol-loader.js        # File → 文本 → JSON.parse → Parsed Object
│   ├── protocol-schema-validator.js  # Ajv 2020 封装，加载正式 Schema
│   ├── protocol-semantic-validator.js  # D1-R2 确定性语义校验（可达性/Human Gate/Side/Role）
│   ├── protocol-registry.js         # Available / Invalid 分流 + 重复检测
│   ├── protocol-diagnostic.js       # 统一诊断结构（含 RUNTIME_* / PERSISTENCE_* / COMPILER_* / ROLE_* 码）
│   ├── protocol-file-source.js      # File 快照 + protocols/**/protocol.json 与 roles/*.json 发现（D2-F1 补 ASSET_PATH）
│   ├── protocol-session.js          # Session 冻结（第42题：无热加载）
│   ├── meeting-state.js             # D1-R3 Meeting 状态模型 + 错误模型
│   ├── meeting-action.js            # D1-R3 Pending Action 构造
│   ├── meeting-factory.js           # D1-R3 从 Available Protocol 创建 Meeting
│   ├── meeting-runtime.js           # D1-R3 核心确定性引擎（start/drive/transition）+ R4 事件/检查点埋点
│   ├── meeting-event-log.js         # ★D1-R4 Append-only Event Log（seq 0..N-1，可注入时钟）
│   ├── meeting-checkpoint.js        # ★D1-R4 Checkpoint 深拷贝快照（挂 checkpoint_created 事件）
│   ├── protocol-fingerprint.js      # ★D1-R4 Canonical JSON + Web Crypto SHA-256 协议指纹
│   ├── meeting-archive.js           # ★D1-R4 Runtime Meeting → meeting.schema 存档 DTO
│   ├── meeting-schema-validator.js  # ★D1-R4 单 Ajv 实例 + $ref Schema Pack（meeting/role/message/artifact/annotation）
│   ├── meeting-restore-validator.js # ★D1-R4 恢复语义校验（协议存在/指纹一致/事件/检查点/状态一致性）
│   ├── meeting-persistence.js       # ★D1-R4 序列化 + 浏览器 Save/Load（Blob 下载 / file input）
│   ├── meeting-restore.js           # ★D1-R4 存档 → Runtime Meeting 原子恢复（绝不重新 start）
│   ├── role-card-registry.js       # ★D2-R1 Role Card 装载 / 按 role_class 与 role_id 确定性解析（补 §24-1 缺口）
│   ├── instruction-packet-schema.js # ★D2-R1 InstructionPacket Schema 校验器（Ajv2020）
│   ├── instruction-compiler.js      # ★D2-R1 确定性 (Protocol,Meeting,Phase,Participant)→InstructionPacket（D2-F1 改用 resolveForParticipant）
│   ├── prompt-renderer.js           # ★D2-R2 确定性 InstructionPacket → 人类可读 Prompt 文本（按 Role-Card-Spec §5 红化）
│   ├── mock-agent-runtime.js        # D1-R3 测试用 Mock Agent 推进（D2-F1 新增 stepOnce 单步语义）
│   ├── invocation/                  # ★D3-D0 WEB_RELAY Transport 合同（纯数据，不发起网络请求）+ D3-D0-F1 行数拆分（单文件≤100，request.js 106 享 ≤110 例外）+ ★D3 WEB_RELAY Manual Relay 协调层
│   │   ├── agent-invocation-request.js     # Meeting→Transport 唯一合同（request_id 内容寻址 + sequence）[106 行，≤110 明确例外]
│   │   ├── agent-invocation-result.js       # Transport→Meeting 唯一合同（Result≠正式Message，无 message_id）
│   │   ├── agent-web-relay-state-machine.js # Manual Relay 状态机（8 态，replay 可重放恢复）
│   │   ├── agent-transport-adapter.js      # TransportAdapter 抽象接口 + create 工厂（D3-D0-F1 拆出下列两文件）
│   │   ├── agent-mock-transport.js          # MockTransport（确定性，无外部调用）
│   │   ├── agent-web-relay-transport.js     # WebRelayTransport（状态机驱动 Manual Relay，禁 api/local/web_automation）
│   │   ├── agent-web-relay-controller.js    # ★D3 WEB_RELAY 协调层（56 行）：open/receive/validate(V01–V05)/accept/reject/retry/cancel/hydrate；无 DOM/无网络/不生成 Prompt
│   │   └── invocation-message-factory.js    # ★D3 WEB_RELAY 把已 Accept 的 Result 落成正式 Message（accepted_by_runtime=true，43 行）
│   ├── harness/                     # ★D2-F1 无 DOM 流程层（可在 Node 直接测试，每文件 ≤100 行）+ ★D3 WEB_RELAY 编排层
│   │   ├── harness-store.js          # 共享状态 + 订阅；setSession 从 snapshot.assetFiles 冻结装入 Role Card/Schema Pack/Packet Schema
│   │   ├── participant-binding.js    # Participant 下拉来源（只来自 meeting.participants[]）+ 当前相位 actor 标注 + Compiler 禁用态
│   │   ├── meeting-draft.js          # ★D3 会议控制台 MeetingDraft（81 行）：创建前草稿模型 + 校验 + 一次性创建（Draft 非事实源，创建后冻结）
│   │   ├── relay-profiles.js         # ★D3 WebRelayTargetProfile（66 行）：Transport 本地配置（web_url 不进 Schema）+ URL 安全校验 + upsert
│   │   ├── local-store.js            # ★F1 localStorage 封装（35 行：JSON 读写 + 异常静默降级；键前缀 ai-council:v1:）
│   │   ├── seat-config-rules.js     # ★F1 席位配置字段权限（51 行：FIELD_POLICY identity/runtime + FIELD_ALIAS 别名，T04 单一来源）
│   │   ├── seat-session-store.js     # ★F1 创建前草稿/Transport Profile 持久化（40 行：draft 一次性创建 + profiles 落盘）
│   │   ├── meeting-admission.js        # ★F1-RT 入会检查（51 行：Runtime Admission 合同，admitted/blocked 不假装 online，externalReady 留接口）
│   │   ├── meeting-turn-selector.js    # ★F1-RT 轮转派生（58 行：getRoundRoster 单一权威/derivePending/phaseStatus/nextTarget 游标）
│   │   ├── meeting-response-state.js   # ★F1-RT 可逆正式发言（82 行：latestOfficial/revise/revoke + 追加事件，历史不物理删除）
│   │   ├── meeting-replay.js         # ★MEETING-REPLAY-F1 时间轴/只读回放（99 行：buildTimeline + replayStateAt Event Cursor 重建，F1-RT 消费 agent_output_revoked 保持 Live/Replay 一致）
│   │   ├── meeting-step-flow.js      # 会议步进流程（98 行）：step 路由 web_relay 停下交人工 / Create Demo 只 start / Mock 单步 / Human Gate 只接人工 / Battle 确定性默认
│   │   ├── compile-flow.js           # 编译产物：compile → Packet Schema 校验 → render，返回摘要/Raw/Prompt
│   │   ├── relay-flow.js             # ★D3 WEB_RELAY 编排层（82 行）：CompileFlow↔WebRelayController 接合；routeStep 供 step 委托停下；createRelayDemo；依赖项调用时取 A.*
│   │   └── archive-flow.js           # buildArchive / restoreFrom（Schema + Restore 语义校验 + 原子恢复）
│   └── ui/
│       ├── dom.js               # 轻量 DOM 工具
│       ├── ui-text.js           # ★D3 UI 中文文案单一来源（94 行）：TERM/RELAY_STATE/MEETING_STATUS/CHOICE/TRANSPORT/ERROR 六张映射 + 六个查询函数；机器状态值不经此文件
│       ├── diagnostic-view.js   # 坏规则诊断渲染
│       ├── registry-view.js     # 可用规则 / 已隔离规则列表渲染（中文标签 + 中文空状态）
│       └── harness/             # ★D2-F1 视图层（DOM，只画不判规则）+ ★D3 六席会议控制台面板
│           ├── harness-shell.js       # 外壳：能力灯 6 个 + 独立运行状态行 + 三 Tab（默认会议）+ 订阅 Store 全量重绘；装配六席 + 项目条 + 时间线 + 开发工具条
│           ├── meeting-actions.js     # 会议按钮行为（中文提示）；含 createRelay + load 后 hydrate
│           ├── web-relay-actions.js   # ★D3 WEB_RELAY 中继点击行为（78 行，中文错误提示 + 错误代码；activeSession 共享判定）
│           ├── console-actions.js     # ★D3 控制台动作层（100 行）：MeetingDraft 持有 / F1 字段级冻结 / 持久化委托 SeatSessionStore / 打开模型网页 / 清空会议 + ReplayCursor 重置
│           ├── replay-cursor.js       # ★MEETING-REPLAY-F1 回放游标（34 行：-1=跟随最新；prev/next/toLatest 只改 cursor 不碰 Runtime）
│           ├── replay-provider.js     # ★MEETING-REPLAY-F1 Display State 唯一出口（41 行：live|replay 视图投影 + mutatingDisabled）
│           ├── seat-local-config.js   # ★D3 席位本地 UI 配置（67 行：立场覆盖/备注/模式/选中席位/运行配置；F2-F1 runtimeConfig 持久化）
│           ├── seat-edit-draft.js     # ★F2 席位编辑草稿（47 行：get/init/set/dirty/clear；runtime 刷新不得覆盖未保存输入）
│           ├── meeting-hud.js         # ★F2 Meeting HUD（91 行：标题/议题/Round/Phase/计时器/状态；1s 局部时钟，TEST-10 唯一 setInterval 白名单）
│           ├── seat-status.js         # ★D3 席位状态中文判定 + 当前轮次判定（37 行，纯函数）
│           ├── seat-card.js           # ★D3 席位摘要卡（76 行：编号/角色/模型/传输/立场/状态 + 选中/编辑/打开网页）
│           ├── seat-column.js         # ★D3 左右席列装配（90 行：左 A1..A3 / 右 B1..B3 + 右栏会议摘要窄卡 mt-* 契约）
│           ├── seat-config-fields.js  # ★D3 席位配置表单字段（F1 双栏 grid + 挂起式编辑 + [取消]/[保存配置]；cfg-*-<pid> 契约）
│           ├── seat-config-commit.js  # ★F1 席位配置保存提交（45 行：写入 participant/profile/立场/备注 + 自动回运行）
│           ├── seat-config-panel.js   # ★D3 席位配置模式装配（51 行）
│           ├── center-stage.js        # ★D3 中央大屏（70 行：模式条/上下文/会议配置卡/运行与席位配置双面板显隐）
│           ├── config-panel.js        # ★D3 中央会议配置卡（70 行：名称/议题/议事规则 + 创建会议；无会议=表单/有会议=冻结摘要）
│           ├── relay-workarea.js      # ★D3 中栏 Prompt/Response 大工作区（53 行，页面最大区域）
│           ├── relay-verdict.js       # ★D3 校验状态行 + 折叠详情（46 行，V01–V05 不霸占页面）
│           ├── relay-panel.js         # ★D3/F1-RT 中央运行模式（99 行：执行 + 工作区 + 校验仅 FAIL + 阻塞卡转发）
│           ├── relay-blocked.js        # ★F1-RT 阻塞卡（24 行：当前发言人无法入会 → 原因 + 配置入口）
│           ├── seat-nav.js            # ★F1-RT 席位浏览导航（48 行：上一席/当前 x/y/下一席，只改查看不改调度）
│           ├── preflight-panel.js     # ★F1-RT 会议点名卡（54 行：开会前逐席点名，全部 admitted 才可开始）
│           ├── timeline-panel.js      # ★D3 底部会议时间线/审计日志折叠区（40 行）
│           ├── dev-tools-panel.js     # ★D3 开发工具条（40 行：Demo 装载/清空，退出主流程）
│           ├── project-bar.js         # ★D3 顶栏项目条（85 行：目录压缩为一行 + IndexedDB 记住上次项目）
│           ├── compiler-view.js       # Compiler Tab 渲染（禁用态 / Participant 下拉 / 角色解析）
│           └── compiler-packet-view.js# 编译产物渲染（摘要 / Raw JSON / Rendered Prompt 只读 textarea）
├── vendor/
│   └── ajv2020.bundle.js       # Ajv 8.20.0 (Draft 2020-12) IIFE 本地打包
└── tests/
    ├── test-runner.html        # 浏览器内测试页（无服务器，运行 D1 用例 TEST-01..15）
    ├── test-runner.js          # 测试运行器
    ├── run-node.js             # Node 入口（自动测试，现 203 项，含 harness/* 与 invocation/* 与 WEB_RELAY flow + recovery + console-draft + seat-layout + meeting-replay）
    ├── run-browser.js          # Playwright 真机验收入口（D1..D7 + F1/F2/F2-F1 + F3 四视口 L01..L10；250 项）
    ├── protocol-test-suite.js  # 测试框架
    ├── protocol-test-fixtures.js
    ├── protocol-test-cases.js  # TEST-01..07, 11, 12（Loader/Schema/Registry）
    ├── protocol-test-cases-session.js  # TEST-08..10, 13..15（冻结/Schema Override）
    ├── protocol-test-cases-semantic.js  # TEST-16..31（D1-R2 语义校验）
    ├── protocol-test-cases-runtime.js   # TEST-32..53（D1-R3 会议运行时）
    ├── protocol-test-cases-persistence.js  # TEST-54..84（D1-R4 事件/检查点/指纹/存档/恢复）
    ├── protocol-test-cases-compiler.js    # TEST-85..109（D2-R1 Instruction Compiler / Role Card）
    ├── protocol-test-cases-renderer.js    # TEST-110..128（D2-R2 Prompt Renderer）
    ├── protocol-test-cases-harness.js     # ★TEST-129..144（D2-F1 接线：脚本装配/冻结/禁用/Mock单步/Human Gate/Role≠Participant/Save-Load）
    ├── protocol-test-cases-web-relay-contract.js   # ★D3D0-01..08（D3-D0 合同结构：Request/Result）
    ├── protocol-test-cases-web-relay-state.js      # ★D3D0-09..12（D3-D0 状态机/TransportAdapter/WebRelay 端到端；D3-D0-F1 由 169 行单文件拆分）
    ├── protocol-test-cases-web-relay-flow.js       # ★WR-01..05（D3 WEB_RELAY 生命周期：open/validate(V01–V05)/accept/submit；67 行，由 145 行拆分）
    ├── protocol-test-cases-web-relay-recovery.js   # ★WR-06..13（D3 WEB_RELAY 持久化与集成：Save/Load/cancel/retry/step路由/accept写messages；98 行，由 145 行拆分）
    ├── protocol-test-cases-console-draft.js        # ★TEST-147..154（D3 会议控制台：MeetingDraft 校验/一次性创建/议题落库 + RelayProfiles URL 安全/upsert；123 行，测试文件不受 ≤100 约束）
    ├── protocol-test-cases-seat-layout.js          # ★TEST-155..160（D3 六席：SEATS 顺序/映射/立场覆盖/seat↔participant 双向/六席模板建会 topic 入 Packet；95 行，测试文件不受 ≤100 约束）
    ├── protocol-test-cases-meeting-replay.js       # ★TEST-173..184
    ├── protocol-test-cases-meeting-runtime-f1.js     # ★TEST-185..196（N01..N10 六席状态机 + Admission + Live/Replay 一致）（MEETING-REPLAY-F1 十二项防御性门禁：timeline 单调/不改 live/不产 Message/PendingAction/B1 before-after/跨阶段/save-load/displayState 一致）
    ├── source-bundle.js        # 被测模块聚合（浏览器/Node 共用）
    ├── fixtures/acceptance/protocols/   # 人工验收样例
    │       ├── good-a/ good-c/  broken-b/  missing-version/
    │       └── dup-x/ dup-y/    # 各含 protocol.json
    └── fixtures/fake-ai-page.html       # ★WEB_AUTOMATION 假 AI 页面（输入/发送/生成中/回答/登录墙，离线测试用）
```

## automation/（WEB_AUTOMATION 本地 Node Worker，仅自动化模式，方案 §九/§十二）

```text
automation/
├── start.js                    # 入口：node automation/start.js → http://127.0.0.1:3741/（仅本机）
├── core/
│   ├── automation-errors.js    # 10 个 AUTOMATION_* 错误码（中文+代码+阶段）+ AutomationError
│   ├── automation-result.js    # AutomationResult（ok/responseText/error/artifactDir；永不自动进 Message）
│   ├── automation-session.js   # 状态机（idle→…→completed + 异常终态）+ 步骤进度
│   └── automation-controller.js# 编排：Driver 启动→打开目标→发送→条件等待→提取；失败证据落盘
├── browser/
│   └── browser-profile.js      # runtime/browser-profile（gitignore）+ artifacts 目录（browser-manager 预留未建）
├── drivers/
│   ├── automation-driver.js    # AutomationDriver 接口契约（Transport 层禁直接 require playwright）
│   ├── playwright-driver.js    # 主路径：launchPersistentContext + 专用 Profile + 条件等待（99 行）
│   └── visual-locator.js       # VisionLocator 接口冻结（boundingBox/confidence/method/evidence；不实现）
├── sites/
│   ├── site-adapter.js         # 站点适配器工厂（PoC 仅 chatgpt）
│   └── chatgpt-adapter.js      # ChatGPT：ARIA/Role 优先候选 + 生成检测 + 回答提取
├── server/
│   ├── static-server.js        # app/ 静态服务 + automation-ui.js 注入（同源）
│   └── automation-server.js    # /api/automate + /api/status/:id + /api/result/:id + /api/health
├── ui/
│   └── automation-ui.js        # 覆写 AutomationBridge 为同源 fetch（仅 localhost 注入）
└── tests/
    ├── offline-automation-tests.js  # A01..A12b：Fake AI Page 离线全链路（14 项）
    └── smoke-server.js              # server 冒烟（health/注入/automate 202/404）
```

## schema/（正式 Schema，优先级高于个人判断）

```text
schema/
├── schemas/
│   ├── protocol.schema.json    # ★ D1-R1 校验依据（未修改）
│   ├── meeting.schema.json     # ★ D1-R4 存档校验依据（D3-D0 追加 invocation_created/invocation_cancelled 两个 event_type 枚举值；invocation_waiting 经 D3-D0-F1 审计移除，manifest 同步刷新）
│   ├── role.schema.json  message.schema.json      # D1-R4 作为 $ref Schema Pack 注册
│   ├── artifact.schema.json  annotation.schema.json
│   ├── instruction-packet.schema.json # ★ D2-R1 新增（编译产物校验；非冻结 6 份之一）
├── examples/                   # valid-* / invalid-* 示例集
├── reports/                    # Schema-Field-Freeze.md 等
├── tools/validate_schemas.py
├── manifest.sha256.json
└── README.md
```

## roles/（D2-F1 Role Card 库，符合 role.schema.json）

```text
roles/
├── advisor.json             # role_id=advisor-base, role_class=advisor
├── chair-secretary.json     # role_id=chair-secretary-base, role_class=chair_secretary
├── strategic-advocate.json  # role_id=strategic-advocate, role_class=advisor（D2-F1 提升为正式卡）
└── risk-challenger.json     # role_id=risk-challenger, role_class=advisor（D2-F1 提升为正式卡）
```

## docs/（Phase 0 冻结文档）

```text
docs/
├── Council-Constitution.md
├── Protocol-Composition.md
├── Procedure-Execution-Protocol.md
├── Communication-Protocol.md
├── Role-Card-Spec.md
├── Decision-Report-Spec.md
├── Human-Annotation-Spec.md
├── Knowledge-Export-Spec.md
├── Meeting-Persistence-Spec.md
├── Model-Transport-Spec.md
├── Phase-0-Freeze-Register.md
├── d3-web-relay-contract.md   # D3-D0 WEB_RELAY Transport 合同冻结
└── Phase-0-Package-README.md
```

## 技术栈

正式实现已冻结为纯浏览器 **HTML / CSS / JavaScript**，无服务器、无后端、无 CDN、无构建产物。早期 C# 探索实现（`.slnx` / `src/` / `tests/`）已在 D1-R1-F1 从工作树删除，仅保留于 Git 历史，不作为正式运行代码；当前运行代码仅为 `app/`。

## D2-F1 接线边界（用户裁定冻结）

- **只做接线**：把已完成的 Protocol Kernel / Meeting Runtime / Persistence-Restore / Instruction Compiler / Prompt Renderer 接进同一浏览器 Harness。不做 D3 Transport、不接真实 LLM、不做正式六席会议室 UI。
- **Role ≠ Participant ≠ Model**：Compiler 的可选对象只来自 `meeting.participants[]`，绝不把 `roles/*.json` 当 Agent。
- **Mock 单步**：每点一次「执行下一步 Mock」只消费当前 Pending Action 的一个确定性步骤，绝不自动越过 Human Gate；Finish / Continue / Battle 必须由人工点击。
- **能力灯**：Protocol ✅ Runtime ✅ Persistence ✅ Compiler ✅ Renderer ✅（HarnessShell 按模块存在性判定）。
- **红线**：单文件 ≤100 行；D2-F1 新增 `harness/*`（5 个，无 DOM）与 `ui/harness/*`（5 个，视图层）均守此界。

## D3 · WEB_RELAY — Manual Relay 接线边界（用户裁定冻结）

- **只做 Manual Relay**：人工从面板复制 Prompt、粘贴外部 AI 回答，系统做 V01–V05 校验、经人工 Accept 后才把被接受的内容落成正式会议消息、Runtime 继续。不接真实 LLM、不自动发网络、不做六席会议室 UI、不做 D3-R2 自动校验。
- **Runtime 不知道 ChatGPT**：代码中无 ChatGPT/Claude/Gemini/OpenAI/browser/textarea/DOM 概念，只有 `web_relay` 这个 transport_kind 与 Prompt/Response 文本。外部 AI 身份对 Runtime 完全透明。
- **AI 回答不直接成为会议事实**：禁止 `Paste → meeting.messages.push(...)` 捷径；必经 `WebRelayController.validate`（V01–V05）→ `accept`，再由 `InvocationMessageFactory` 落成 `accepted_by_runtime=true` 的正式 Message。
- **Human Gate 仍不是 Transport**：`waiting_human` 时 WEB_RELAY 必须完全停下；`MeetingStepFlow.step` 遇 web_relay 参与者返回 `{ok:false, reason:"web_relay"}`，绝不替外部 AI 推进会议。
- **Schema 零改动**：复用既有 `event_type`（agent_output_received 等）、`participants[].transport_kind`、`meeting.state_data`（开放袋存 web_relay 运行态 + hydrate 断点续传）；不新增事件枚举（延续 D3-D0-F1 移除 invocation_waiting 的治理）。
- **能力灯**：Protocol ✅ Runtime ✅ Persistence ✅ Compiler ✅ Renderer ✅ WebRelay ✅（6 个，HarnessShell 按模块存在性判定，与是否已建会议无关）。
- **红线**：核心文件均 ≤100 行（controller 56 / message-factory 43 / relay-flow 82 / web-relay-view 92 / web-relay-actions 78 / ui-text 94；request.js 106 享 ≤110 例外）；测试文件 WR flow 67 + recovery 98（由 145 行拆分，均 ≤100）。
- **完成门禁**：Node 169/169 PASS、Contract 12/12、Line Audit / Dead Reference / Script Assembly / Schema·Manifest 均 PASS；中文 UI 审计 PASS（0 处过期 D2-F1 文案）；**Browser Gate NOT VERIFIED（沙箱无 Playwright，待开发机复跑 run-browser.js B01..B25 + 人工验收 A01..A10）**。
