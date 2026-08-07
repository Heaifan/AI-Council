# Changelog — AI 顾问委员会 v0.1

> 格式参考 Keep a Changelog。所有变更按时间倒序。

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
