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
