# MEETING-RUNTIME-F1 · T01 状态机根因审计报告

> 日期：2026-08-09 ｜ 基线：`7940111 == origin/main`、worktree clean、Node 203/203、Browser 250/250（提交前 fresh）
> 性质：**只读审计，零代码修改**。十项答案全部来自当前 HEAD 的真实代码链路（行号可复查）。

## 十项答案

### 1. 当前「下一步」按钮 enable 条件到底是什么？

`app/js/ui/harness/seat-column.js:52`

```js
var canStep = !!(s.pending && s.pending.type === A.MeetingAction.ACTION.COLLECT_RESPONSES) && !isReplay;
```

即：`pendingAction` 存在、类型为 `collect_responses`、非回放模式。按钮文案「执行下一步（模拟）」。

### 2. 它代表 phase advance 还是 speaker advance？

**都不是**。它代表「让 Mock 替**下一个未发言的 mock 席位**模拟提交一次响应」：

```
MeetingActions.step → MeetingStepFlow.step → RelayFlow.routeStep
    → MockAgentRuntime.stepOnce → runtime.submitResult(next)
```

- `routeStep`（relay-flow.js:22-35）：找 required 中第一个未 received 的席位；若是 `web_relay` 返回 `auto:false`（**拦截，交人工**）；否则 `auto:true` 继续 mock。
- `stepOnce`（mock-agent-runtime.js:42-47）：同样循环找第一个未 received，`submitResult`。
- 点击一次 = **一个 mock 席位发言**。不推进阶段、不推进「当前席」概念（因为根本没有）。

### 3. A1 Accept 后哪个状态发生改变？

完整链路：`WebRelayActions.accept → RelayFlow.accept → WC().accept（状态机→accepted）→ MeetingRuntime.submitResult`（relay-flow.js:65-71）。

`submitResult` 内（meeting-runtime.js:194-234）依次改变：

| 状态 | 变化 |
|---|---|
| `pendingAction.receivedParticipantIds` | `push(pid)`（:214）——**唯一写入点** |
| `meeting.lastAction` | 更新为 collect_responses 记录（:215） |
| Event Log | `agent_output_received`（mock:false）（:216-219） |
| `meeting.messages` | `InvocationMessageFactory.append` 追加正式消息（含 `accepted_by_runtime:true`） |
| 阶段完成判定 | `received.length >= need`（按 completion.mode）→ `completeAndTransition`：`phase_completed` 事件 + `recordCompletion` + resolveTransition → **enterPhase 下一阶段**（:229-232） |

**没有 activeSpeaker 字段被改变——因为不存在。**

### 4. active speaker 当前有没有独立字段？

**没有**。会议状态里只有 `pendingAction.{requiredParticipantIds, receivedParticipantIds}`。「当前轮次」是 UI **派生显示**：

- `SeatStatus.isCurrentSeat`（seat-status.js:26-33）：`required 包含该席位 && received 不含` → 当前轮次。
- `SeatStatus.statusText`（:17-22）：required 含 + received 含 → 「已发言」；required 含 + 未收 → 「当前发言」。
- 任何席位接受后，「下一个是谁」由两处**各自循环推导**：`MockAgentRuntime.stepOnce`（mock 路径）与 `RelayFlow.nextRelay`（web_relay 路径）。两套推导逻辑相同但**物理重复**，且都没有持久状态。

### 5. selected seat 与 current speaker 是否共用状态？

**物理分离、零同步**：

- `selectedSeatId` 在 `SeatLocalConfig`（seat-local-config.js:12），UI 会话状态（localStorage），点击席位卡才变，`setSelectedSeat` 同时把 mode 切到 `"seat"`（配置模式）。
- 「当前轮次」由 pendingAction 派生，与 selectedSeat 无关。
- 后果：A1 发言完自动进入 A2（理论上的轮转）时，selectedSeat 仍停在上次点击的席位；中央工作区也**不会**跟随发言者切换（见第 3 项：accepted 后 activeSession 终态 → 中央回 idle）。

### 6. 六席 expected speakers 从哪里产生？

`MeetingRuntime.enterPhase → resolveParticipants(phase.actor, meeting)`（meeting-runtime.js:50-95）：

```
all_advisors → role_class==="advisor" 的 participants（按 participants 数组顺序）
side / role_class / participant_ids / selected_participants（读 stateData.battle_participants）
```

结果存入 `pendingAction.requiredParticipantIds`（`MeetingAction.collectResponses`）。**Protocol 只提供 actor 选择器；名单来自 Meeting participants 的解析**。Roster 在**每次 enterPhase 时重新解析**（协议+participants 不变则结果稳定，但没有任何「冻结」机制）。

### 7. received agents 从哪里产生？

唯一写入点：`meeting-runtime.js:214` `pa.receivedParticipantIds.push(pid)`（mock 与 web_relay 都经 submitResult）。**只有 push、没有 remove**——撤回在状态层面无出口。

### 8. phase completion 在哪里计算？

`submitResult` 尾部（meeting-runtime.js:221-232），按 `phase.completion.mode`：

```
all_selected_respond → need = required.length
any_selected_respond → need = min_responses
secretary_respond    → need = 1
received.length >= need → completeAndTransition（阶段完成 + 切下一阶段）
```

**没有独立 phaseComplete 布尔**——「完成」是即时数量判断，阶段切换后 pendingAction 整体被替换（received 清零进入下一阶段）。撤回会破坏这个单调递增假设。

### 9. 当前是否已有 admission/join 概念？

**没有**。仓库存在的是配置层能力：

- `RelayProfiles`：model_ref → web_url 映射表 + `isSafeUrl`（relay-profiles.js:13-21）
- 席位配置运行时可改（model_ref/transport_kind 热改，FIELD_POLICY 仅锁 identity，seat-config-rules）
- seat-card「打开网页」按钮：`!p || !isSafeUrl(webUrlFor(profiles, modelRef))` → disabled（seat-card.js:74-76）

**没有任何「入会检查」**：会议 start 不检查参与者配置；轮转不检查下一席。未配置 model_ref 的 web_relay 席位：`nextRelay` 照常返回它 → 「生成提示词」点击后打开网页按钮 disabled / CompileFlow 无模型 → **用户卡在无声状态**（mt-step 被 routeStep 拦截返回 warn，但工作区无解释）。

### 10. official response 为什么不可撤回？

消息对象（invocation-message-factory.js:25-34）字段：

```js
{ message_id, meeting_id, phase_id, sender, recipients, content: {raw_text}, validation, accepted_by_runtime: true, created_at }
```

**无 status / revision / supersedes 字段**；`meeting.messages` 是 append-only 数组；receivedParticipantIds 只 push。schema 层（meeting.schema.json messages 数组）无版本/状态约束——**现有结构确实无法表达「撤回但不删除历史」**，需最小增量（字段级，非 schema 重做）。

---

## 根因链：为什么「A1 完成后会议卡死」

```
A1(web_relay) accept
  → received=[a1]，A1=已发言（阶段内派生）
  → activeSession 终态 → 中央工作区回 idle（relay-panel 无 active 即无工作区）
  → 下一个 web_relay 席位（如 A2）只存在于 nextRelay 的循环推导
  → UI 无任何「自动打开 A2 工作区 / 生成 A2 Prompt」机制
  → 用户需手动点「生成提示词（A2）」；若 A2 未配置模型 → 打开网页 disabled → 无声死锁
```

核心缺口 = **没有 activeSpeaker 状态位、没有接受后自动轮转、没有轮转前入会检查**。三个缺口相互叠加。

## 与方案 T01..T21 的映射（复用优先）

| 方案概念 | 仓库现状 | 处置 |
|---|---|---|
| `roundRoster` | 无冻结名单；enterPhase 每次解析 requiredParticipantIds | 新增（在 meeting-runtime 边界内：enterPhase 时生成并冻结） |
| `speakerQueue` | 无；两处循环推导（stepOnce/nextRelay）重复实现 | 改为**派生式**：`roster.filter(!hasActiveOfficialResponse)`，删除重复推导 |
| `activeSpeaker` | 无 | 新增状态位（meeting 或 phaseRuntime），submitResult 后自动推进 |
| `selectedSeat` | SeatLocalConfig（独立） | 保留，加「查看中」语义显示 |
| `receivedSpeakers` | `pendingAction.receivedParticipantIds`（push-only） | 保留为权威源，补 remove 语义（撤回） |
| Admission | 无 | 新增（Runtime Admission 第一层：seat/role/enabled/model/transport/url/归属/roster） |
| 修改/撤回 | 无（messages 无 status/revision） | 最小增量：message 加 `status/revision/supersedes`（复用现有 message 对象） |
| 导航 | mt-step 语义混乱 | 拆：上一席/下一席（浏览 selectedSeat）+ 进入下一阶段（仅 6/6 时） |

**复用边界**：`meeting-runtime.js`（submitResult/enterPhase/drive）扩状态与轮转；`meeting-action.js`（pendingAction 工厂）补字段；`relay-flow.js`（nextRelay/routeStep）改为读派生队列；`seat-status.js`（状态文案）扩展；`seat-column.js`/`seat-card.js`（UI 投影）跟随。**不新建架构、不重写 Protocol**。

---

**待确认**：以上十项与方案理解一致吗？确认后我按 T02（Protocol 边界审计）→ T03（Roster）→ T04（Admission）→ T05.. 顺序执行，状态机先行，UI 只是投影。
