# D1-R3 Meeting State Machine / Deterministic Runtime 开发报告

> 阶段：D1-R3 — Meeting State Machine / Deterministic Runtime（COMPLETE）
> 技术栈：HTML / CSS / JavaScript（纯浏览器，无服务器、无后端、无 CDN、无构建）
> 原则：确定性、不修改正式 Schema、不越界到 D1-R4 / D2（无 LLM、无 Prompt 编译、无持久化/恢复/回放）

## 1. 当前阶段

D1-R3 Meeting State Machine / Deterministic Runtime 已完成。系统从「验证一套会议规则能否被执行」升级为「按这张经过验证的 Phase Graph 真正向前推进会议，并能随时回答『这个会议现在在哪、下一步合法动作是什么』」。

- Phase 0 ✅ CLOSED
- Schema v0.1 ✅ CLOSED
- D1-R1 Loader / Registry ✅ CLOSED（D1-R1-F1 收口）
- D1-R2 Semantic Validator ✅ CLOSED
- **D1-R3 Meeting State Machine / Deterministic Runtime ✅ COMPLETE（本轮）**
- D1-R4 Persistence / Restore / Replay ⬜ NEXT（本轮明确不实现）

## 2. TODO

T01–T25 全部完成。其中浏览器交互式真机验收（类 F1 的 A01–A06）本环境无法执行，如实记为 NOT RUN，逻辑层由 53/53 Node 测试 + 静态审计（AUDITED 禁止 setInterval/fetch/fs/XHR 等）覆盖。

## 3. Git 基线

- 基线：main @ `f96cffe`（D1-R2）
- D1-R3 后 HEAD：见仓库最新 main HEAD（commit 后生成，push 后 HEAD == origin/main）

## 4. 实际修改文件

新增：

- `app/js/meeting-state.js` — Meeting State 模型 + 错误模型（`STATUS` / `makeDiagnostic` / `markFailed` / `recordCompletion` / `isActive`）
- `app/js/meeting-action.js` — Pending Action 构造（`MeetingAction.ACTION` / `collectResponses` / `awaitHumanDecision`）
- `app/js/meeting-factory.js` — 从 Available Protocol + config 创建 Meeting（`MeetingFactory.createMeeting`）
- `app/js/meeting-runtime.js` — 核心确定性引擎（`start` / `getNextAction` / `submitResult` / `submitHumanDecision` / `resolveTransition` / `resolveParticipants` / `enterPhase` / `drive`）
- `app/js/mock-agent-runtime.js` — 测试用 Mock Agent 推进（`MockAgentRuntime.runOnce`）
- `app/tests/protocol-test-cases-runtime.js` — TEST-32..TEST-53（22 项）
- `reports/d1-r3-report.md` — 本报告

修改：

- `app/js/protocol-diagnostic.js` — 冻结 10 个 `RUNTIME_*` 诊断码
- `app/js/meeting-*` / `app/tests/run-node.js` — RUNTIME / AUDITED 增加 D1-R3 模块与运行测试文件
- `app/index.html` — 加载 5 个新脚本 + 页眉/脚注更新为 D1-R3
- `file-tree.md` / `changelog.md` — 同步 D1-R3

删除：无。正式 `schema/` 文件均未改动。

## 5. 设计边界（R01–R17 摘要）

| 边界 | 规则 |
| --- | --- |
| 确定性 | 不调用任何 LLM、不编译 Prompt、不做任何随机/网络决策；同一输入永远得到同一结果 |
| 无持久化 | 不实现 Checkpoint / Restore / Replay / Snapshot 落盘（属 D1-R4） |
| 无 Prompt | 不实现 InstructionCompiler / WebRelay / Transport（属 D2） |
| 单一入口创建 | Meeting 只能从 **Available Protocol + config** 经 `MeetingFactory.createMeeting` 创建 |
| 状态机 | status ∈ {initialized, running, waiting_human, paused, completed, failed} |
| Human Gate | 必须真正阻塞：无人类输入绝不推进 phase |
| 合法循环 | 允许 critique↔human 等循环，不靠 completedPhaseIds 阻挡；completedPhaseIds 为 Set 语义唯一列表 |
| 多候选 Transition | **绝不偷偷选数组第一项**；出现 >1 个匹配 transition 必须失败 `RUNTIME_AMBIGUOUS_TRANSITION` |
| 步骤安全阀 | 同步 system/archive 自驱链设 `MAX_INTERNAL_STEPS = 1000`，超限即 `RUNTIME_STEP_LIMIT_EXCEEDED`，不挂死 |
| 错误即失败 | 任何 Runtime 错误 → `status = failed`，绝不 throw / 崩溃 |
| 终止符 | `$end` 是唯一正式终止符；抵达 `$end` → `completed` |

## 6. Meeting State 模型

```text
Meeting = {
  meetingId, protocolId, protocolVersion,
  status,                       // initialized|running|waiting_human|paused|completed|failed
  currentPhaseId,
  completedPhaseIds,            // Set 语义唯一列表
  participants,                 // [{participant_id, role_class, side_id?, ...}]
  stateData,
  pendingAction,                // null | {kind:'collect_responses', phaseId, requiredParticipantIds}
                                //      | {kind:'await_human_decision', phaseId, choices}
  error                         // null | {code, message, details}
}
```

`MeetingState` 暴露：`STATUS` 常量、`makeDiagnostic`、`markFailed(meeting, code, message, details)`（置 `status=failed`、清 `pendingAction`、写 `error`）、`recordCompletion(meeting, phaseId)`（不存在则 push，保持唯一）、`isActive(meeting)`（running / waiting_human）。

## 7. Pending Action 模型

`MeetingAction` 暴露 `ACTION`（COLLECT_RESPONSES / AWAIT_HUMAN_DECISION）与两个构造器：

- `collectResponses(phaseId, requiredParticipantIds)` → `{ kind:'collect_responses', phaseId, requiredParticipantIds }`
- `awaitHumanDecision(phaseId, choices)` → `{ kind:'await_human_decision', phaseId, choices }`

`Runtime.getNextAction(meeting)` 直接返回 `meeting.pendingAction`，回答「下一步合法动作是什么」。

## 8. Runtime Pipeline（协议已 Available → 会议推进）

```text
MeetingFactory.createMeeting(protocol, config)   → status=initialized, current=doc.initial_phase_id
   ↓
Runtime.start(meeting, protocol)
   → enterPhase(initial) 设 pendingAction
   → drive()              自驱 system/archive(system_immediate) 链
   ↓
{ running  + pendingAction=collect_responses }   // 等待 Agent/Secretary 提交
{ waiting_human + pendingAction=await_human_decision } // 等待人类裁定
   ↓ submitResult / submitHumanDecision
completeAndTransition(phase, trigger[, choice])
   → resolveTransition（多候选→RUNTIME_AMBIGUOUS_TRANSITION）
   → enterPhase(next) 或 抵达 $end → completed
```

## 9. 核心引擎行为（meeting-runtime.js）

### 9.1 submitResult（Agent / Secretary 响应）
- 校验 `participant_id` 存在（`RUNTIME_PARTICIPANT_NOT_FOUND`）。
- 校验其在 `requiredParticipantIds` 中；重复响应 → `RUNTIME_DUPLICATE_RESPONSE`（同一人第二次响应被拒，不重复计数）。
- 按 `completion.mode` 计算完成条件：`all_selected_respond`=全部、`any_selected_respond`=max(1, min_responses)、`secretary_respond`=1。
- 满足后 `completeAndTransition(phase, 'complete')`。

### 9.2 submitHumanDecision（人类裁定）
- 要求 `status === waiting_human`，否则拒绝。
- 解析 `human_choice` transition；`choice` 非法 → 返回失败诊断但**保持 waiting_human，绝不篡改当前 phase**。
- 合法 choice → 推进到目标 phase。

### 9.3 resolveTransition（关键：多候选挡死）
- 按 `trigger`（+ 可选 `choice`）过滤当前 phase 的 transitions。
- 0 匹配：`human_choice` → `RUNTIME_INVALID_HUMAN_CHOICE`；其他 → `RUNTIME_TRANSITION_NOT_FOUND`。
- **>1 匹配：`RUNTIME_AMBIGUOUS_TRANSITION`**（绝不取数组第一项）。

### 9.4 resolveParticipants（actor 选择）
- `all_advisors` / `side` / `role_class` / `participant_ids` / `selected_participants` / `human_arbiter` / `system` 分流。
- 空选择 / 缺 `participant_ids` / 缺 `selection_key` → `RUNTIME_SELECTION_NOT_FOUND`。

### 9.5 enterPhase（phase 进入分发）
- `agent_turn` / `critique` / `battle` → `collect_responses`。
- `secretary_summary` → `collect_responses`（仅 chair_secretary）。
- `human_gate` → `waiting_human` + `await_human_decision`。
- `system` / `archive` → `pendingAction=null`，由 `drive()` 自动完成并推进。

### 9.6 drive（同步自驱安全阀）
- `while running 且 当前 phase 为 system/archive 且 system_immediate`：完成并推进，步数计数器 +1。
- 超过 `MAX_INTERNAL_STEPS = 1000` → `RUNTIME_STEP_LIMIT_EXCEEDED`，停止自驱不挂死。

## 10. 自动测试 Mock Harness

`MockAgentRuntime.runOnce(runtime, meeting, protocol)`：针对当前 `collect_responses` 动作，为每个 required 参与者提交一条 mock 结果（payload `{mock:true,...}`），并在循环中防御 phase 中途切换。用于 E2E 测试一键跑通整张图。

## 11. Diagnostic Codes

10 个 `RUNTIME_*` 码全部在 `protocol-diagnostic.js` 的 `CODE` 中冻结，复用既有 `ProtocolDiagnostic` 体系：

```text
RUNTIME_PHASE_NOT_FOUND
RUNTIME_PARTICIPANT_NOT_FOUND
RUNTIME_SELECTION_NOT_FOUND
RUNTIME_INVALID_RESULT
RUNTIME_DUPLICATE_RESPONSE
RUNTIME_INVALID_HUMAN_CHOICE
RUNTIME_TRANSITION_NOT_FOUND
RUNTIME_AMBIGUOUS_TRANSITION
RUNTIME_STEP_LIMIT_EXCEEDED
RUNTIME_INVALID_STATE
```

## 12. 自动测试

旧：31/31（TEST-01..31）

新增：TEST-32..TEST-53（22 项）

- TEST-32 从 Available Protocol 创建会议：initialized + currentPhase=opening
- TEST-33 start 后：running + 等待 opening 的 advisors 响应
- TEST-34 all_selected_respond：A 先答不推进，B 答齐后进入 summary
- TEST-35 重复提交：同一参与者第二次响应被拒，不重复计数
- TEST-36 Secretary Summary：仅请求 chair_secretary
- TEST-37 Critique：重新请求 advisors
- TEST-38 Human Gate：进入 waiting_human，无人类输入不推进
- TEST-39 Human Finish：finish → archive(system) → $end → completed
- TEST-40 Human Continue：continue → critique
- TEST-41 Legal Cycle：critique↔human↔continue↔critique 不因循环完成而失路
- TEST-42 Battle：selection 存在时仅请求 selected participants
- TEST-43 Battle 缺 selection：明确失败，不自动选人
- TEST-44 非法 Human Choice：choice=abc 被拒，会议保持 waiting_human 不篡改 phase
- TEST-45 participant_ids selector：只选显式列出的参与者
- TEST-46 side selector：仅选指定 Side
- TEST-47 role_class selector：正确选 Role Class
- TEST-48 System Immediate：system phase 进入即自动完成并推进
- TEST-49 $end：system 直接抵达 $end 即 completed
- TEST-50 Ambiguous Complete Transition：两条 complete 确定性失败（RUNTIME_AMBIGUOUS_TRANSITION）
- TEST-51 Internal Step Limit：超长 system 链触发安全阀，不挂死
- TEST-52 E2E Finish 路径：opening→summary→critique→human finish→archive→completed
- TEST-53 E2E Continue+Battle：完整覆盖 Cycle / Human Gate / Battle / $end

最终：**53/53 PASS**（`node app/tests/run-node.js`）。

## 13. 是否修改正式 Schema

**NO**。6 个 schema 文件（`protocol` / `role` / `meeting` / `message` / `artifact` / `annotation`）均未触碰；`protocol.schema.json` SHA-256 保持 `4573e2cb64019607e5f28417a1112e10fc62dcb32326301a668209f31b3d1f06` 不变。

## 14. 是否实现 D1-R4 / D2

**NO**。`grep` 确认 `app/js` 中无 `Checkpoint` / `Restore` / `Replay` / `InstructionCompiler` / `WebRelay` / `loadSnapshot` / `saveSnapshot` / `persistMeeting` / `fetch(` / `XMLHttpRequest` / `setInterval` / `setTimeout`；AUDITED 审计亦未发现 `require`/`import`/`fs.`/`node:`。Runtime 完全在内存中确定性运行，无任何持久化或 LLM 调用。

## 15. 是否存在范围外开发

**NO**。

## 16. Commit 前检查（§72–§75）

- `node app/tests/run-node.js` → **53/53 PASS**（旧 31 项全 PASS、新 TEST-32..53 全 PASS）。
- `git diff --stat` → 仅 3 文件修改（index.html / protocol-diagnostic.js / run-node.js）+ 6 个新文件，无 schema 改动。
- AUDITED 静态审计 → 无禁止 API（无网络/轮询/CDN/持久化）。

## 17. Git 最终状态（push 后）

- Branch：main
- HEAD：见仓库最新 main HEAD
- origin/main：同 HEAD（已 push）
- Ahead/Behind：0/0
- Worktree：clean

## 18. 当前已知问题

1. 计划 D1-R3 §21 给出的期望 Schema 哈希 `9a918754…` 与本仓库实际 `4573e2cb…` 不一致（与 D1-R1-F1 / D1-R2 发现一致，属计划文档引用过期，非本轮改动）；本轮未修改任何 schema 文件。
2. 浏览器交互式真机验收因本环境无 headless 浏览器未执行，逻辑层已由 53/53 Node 测试 + AUDITED 静态审计覆盖；交互式 GUI 验收需人工在 Chrome/Edge 中按 D1-R3 场景复核。
3. 本轮引入的 Mock Agent 仅用于测试推进，**不是**真实 LLM 决策；真实 Agent / Human 接入（含 Transport / Web Relay）属 D2，连同持久化/回放属 D1-R4，均不在本轮。

## 19. D1-R3 状态

**COMPLETE**

## 20. 下一步

**D1-R4 Persistence / Restore / Replay** —— 在确定性 Runtime（本轮）之上，为会议状态增加落盘、恢复与回放能力；并明确与 D2（InstructionCompiler / WebRelay / 多 Agent 真实 Transport）的边界。
