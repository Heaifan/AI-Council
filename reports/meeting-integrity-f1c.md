# MEETING-INTEGRITY-F1-C · Formal Message Commit — 2026-08-10

> 轮次：MEETING-INTEGRITY-F1-C（F1 总方案第三轮；F1-A/F1-B CLOSED 后按序执行）
> 目标：**Runtime 只由正式 Message 满足 Slot 而推进**——「这个回答有效」→「这个回答成为会议正式事实」。
> 门禁：Node 282/282 · Browser 355/355 · Offline 14/14 · Schema PASS · diff --check PASS

## 一、F1-C-01 审计结论（先查后改，方案 §2）

真实链路（F1-C 前）：`RelayFlow.accept → submitResult → receivedParticipantIds.push → 收齐 → ready → advance → phase_completed`——**transport 即完成依据**。

| 项 | 审计结果 |
|---|---|
| A. Response 存在哪里 | `stateData.web_relay[handle].result` + Transport `T._store[handle].result` |
| B. Validation 结果存在哪里 | `T._store[handle].validation` + stateData（F1-B sync 扩展） |
| C. Pending 当前依据什么完成 | `pendingAction.receivedParticipantIds`（submitResult 无条件 push）← **F1-C 改这里** |
| D. Message Schema 已存在 | message.schema.json（content.raw_text + structured_output + validation + extensions 开放袋）——**缺 request_id/result_id 顶层** |
| E. Event Builder 已存在 | MeetingEventLog（phase_entered/agent_output_received/revised/revoked/…）——**缺 message_accepted/message_rejected** |
| F. Checkpoint 如何序列化 messages | **不含**（state_snapshot 无 messages）；archive DTO `messages: []` 恒空；restore 不恢复——三处缺口 |

**复用**：InvocationMessageFactory（扩展 provenance/normalized）、message.schema.json（加字段）、MeetingEventLog（加事件类型）。未新建任何重复体系。

## 二、实现

### `harness/message-commit.js`（74 行，Formal Message 唯一落库入口）

- **slot** = `phase_id:participant_id:turn`；`turn = pendingAction.phase_entry`（enterPhase 时按 phase_entered 事件计数）——**循环协议（Legal Cycle）第二轮 critique 自动 turn=2，slot 不冲突**（调试实证：turn=0 固定时第二轮被幂等误判已满足，received 死锁）。
- **幂等**（方案 §11/§12）：同 slot 同 message_id → `{ok, noop:true}`（C14 重放 / C16 恢复防重）；同 slot 不同 message_id → `DUP_SLOT` 拒绝（C15，正式事实不覆盖）。
- **落库原子**：`messages.push` → `message_accepted` 事件（payload: message_id/participant_id/request_id/result_id/turn）→ `receivedParticipantIds` 维护 → activeSpeaker 派生更新。
- **effective 判定**：排除 revoked/superseded（撤回后 slot 回 pending，补答不被幂等拦截）。

### Runtime 语义变更

- `submitResult`：**不再 push received**（只记 agent_output_received + 归属校验）——C10「transport accepted 但未 commit → phase 不完成」成立，旁路残留被堵死。
- `MockAgentRuntime`：mock 提交也 commit 正式消息（`extensions.mock=true`、validation=valid、无 provenance）——**完成依据统一**（Browser M03：B1 mock 也算 1 条）。
- `RelayFlow.accept`：三态断言 → submitResult → factory create → **commit**（唯一入口）。
- `WC.validate`：V06 PASS → `message_validated` 事件；各 rejected 分支 → `message_rejected` 事件（payload: participant/request_id/result_id/reason_code/reason/validation 摘要）；`T.validate` FAIL 保留 result（原始错误回答留在会话，审计可追溯）。
- `meeting-replay`：replayStateAt 消费 `message_accepted`（与 agent_output_received 去重合并）——回放「已发言」与 live 的正式落库语义一致。

### 持久化（F1-C-12）

- archive DTO `messages: clone(meeting.messages)`（不再恒空）
- checkpoint `state_snapshot.messages`（meeting.schema.json 变更 + manifest 哈希同步）
- restore 恢复 messages（C16：恢复后重放 → NO-OP）

### Schema 变更

- message.schema.json：+`request_id`/`result_id`（["string","null"]，非 required，旧消息兼容）
- meeting.schema.json：checkpoint state_snapshot +`messages`（$ref message.schema.json）
- manifest.sha256.json 同步（原始字节 SHA-256 + bytes）

## 三、测试

- **Node** `protocol-test-cases-integrity-f1c.js`（TEST-246..263 = C01..C18）：
  - A 落库（C01 JSON / C02 text / C03 normalized / C04 provenance 事件一致）
  - B 拒绝（C05 invalid / C06 缺字段 → messages=0；C07 message_rejected 可追溯；C08 保持 pending）
  - C 推进门（C09 1/2 不完成 / **C10 transport 已收未 commit 不完成** / C11 2/2 完成 / C12 phase_completed 晚于全部 message_accepted）
  - D 幂等（C13 retry 恰好 1 条 / C14 重放 NO-OP / C15 覆盖拒绝 / C16 恢复防重）
  - E **C17 完整 7 条会议**（Opening2+Summary1+Critique2+Battle2 = messages 7 + message_accepted 7 + 故意 invalid summary → message_rejected 1 且最终仍 7 条）
  - F C18 integrity assert（advance 后无未满足 required slot）
- **Browser** `runF1C`（F1C-M01..M05c，11 条）：M01 落库+事件 / M02 不推进 / M03 完成 / M04 拒绝不计数 / M05 修复落库。
- **既有适配**：测试 helper（acceptLike/speak）统一「submitResult + commit」；TEST-70/75/174/WR-05 语义更新（登记）。

## 四、取舍登记

| 项 | 说明 |
|---|---|
| mock 消息入 messages | 统一完成依据（方案 M03 预期 messages=2 含 mock）；extensions.mock 标记，F2/F3 报告可区分 |
| slot turn = phase_entry | 满足「循环协议不撞墙」；多回合 Battle（turn 语义）F2-B 再扩展 |
| received = committed 语义 | receivedParticipantIds 由 commit 维护；既有测试适配完成 |
| revise/revoke 不走 commit | 既有可逆发言机制保留（事件链 agent_output_revised/revoked）；slot effective 判定排除 revoked/superseded |
| 旧存档（无 messages） | restore 缺省 []，兼容 |

## 五、Git 证据

提交时输出 Branch/HEAD/origin/ahead/behind/worktree/stash/Commit Hash（GOVERNANCE.md 闭环）。
