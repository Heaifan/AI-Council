# MEETING-INTEGRITY-F2-B1 · Battle Turn Contract — 2026-08-11

> 轮次：F2-B 第一小轮（用户方案冻结，逐字执行）。只解决「Battle 的回合身份」，不碰上下文内容。
> 门禁：Node **292/292**（+TEST-264..273 B1-01..B1-10）· Browser **363/363**（+F2B1-M01..M02e 八条）· Offline 14/14 · Schema PASS · diff --check PASS

## 一、方案条款 → 落地映射（逐字执行）

| 方案条款 | 落地 |
|---|---|
| F2-B1-01 审计现有链路 | 见 §二（禁止猜：全部读码核实） |
| F2-B1-02 新增 Battle Round 的 Runtime-owned 状态 | `pendingAction.battle_round`（挂 pendingAction，随 checkpoint/archive/restore 自动携带——与 phase_entry/phase_context 同路径） |
| F2-B1-03 Battle 第一次进入 battle_round=1 | `enterPhase`/`reenterPhase` 对 `phase.kind==="battle"` 置 1（meeting-runtime.js） |
| F2-B1-04 仅 Runtime 明确开启下一轮才 +1 | 新 API `MeetingRuntime.advanceBattleRound(meeting, protocol)`：仅 battle + ready_to_advance 放行；`battle_round += 1` + `receivedParticipantIds=[]` + 游标回 roster 首位；绝不因 A1/B1 发言、transport、validation 自动 +1（TEST-264/266 锁定拒绝路径） |
| F2-B1-05 Message Factory 写入 turn + battle_round | `InvocationMessageFactory`/`MockAgentRuntime` 写 `extensions.turn`（phase_entry，不变）+ `extensions.battle_round`（**仅 battle phase 有值才写**，非 Battle 消息零字段） |
| F2-B1-06 Battle Slot 四元组 | `MessageCommit.slotKey(phaseId, pid, turn, battleRound)`；battle 有 round → `phase:pid:turn:round`，非 Battle/旧存档 → 三元不变 |
| F2-B1-07 幂等合同保持 | 同 slot 同 message_id → NO-OP；同 slot 不同 → DUP_SLOT（round 维度精确匹配，TEST-267/268 锁定） |
| F2-B1-08 Checkpoint/Archive/Restore | 零代码改动（pendingAction 深拷贝链自动携带）；TEST-269 锁定「Round2 A1 完成 B1 未完成 → 恢复后 round 不漂移、A1 satisfied、B1 pending、未完成不能开下一轮」 |
| 禁止清单 | 对称上下文 ❌ / Prompt ❌ / UI ❌ / F3 口径 ❌ / human_decision_context ❌（TEST-273 回归锁定恒 null）/ transport ❌ / validation ❌ / secretary ❌ / 胜负判断 ❌ / 自动继续 ❌（advanceBattleRound 是显式 API，无任何自动调用点） |

## 二、审计结论（F2-B1-01，真实链路）

1. **phase_entry 产生**：`enterPhase`（meeting-runtime.js）数 `events` 中 `phase_entered`(同 phase_id) 次数 +1 → `pendingAction.phase_entry`；`reenterPhase` 同逻辑。随 checkpoint 深拷贝 / archive clone / restore clone 自动持久化（`pending_action.additionalProperties:true`，零 schema 变更）。
2. **turn 写入**：`InvocationMessageFactory.create` `extensions.turn = phase_entry || 1`；`MockAgentRuntime.mockMessage` 同。
3. **Slot**：`MessageCommit.slotKey = phaseId:pid:turn`；`findCommitted` 按 phase_id + actor_id + turnOf 匹配；`isSatisfied` = findCommitted ≠ null；`commit` 幂等并维护 `receivedParticipantIds` + `message_accepted`（payload 含 turn）+ activeSpeakerId 派生。
4. **轮转/完成派生**：`MeetingTurnSelector`——`getReceived` = `pendingAction.receivedParticipantIds`（**phase 级集合，无 round 概念**）；`phaseStatus` = received.length ≥ need。→ **多回合关键：开新轮必须重置 received，否则第二轮立即误判 ready**（advanceBattleRound 已处理，TEST-266/270 锁定）。
5. **battle transition**（committee-mvp）：battle（checkpoint:true, complete→human-decision）；human-decision（battle→battle 回环）→「再次进入 battle」= 重新 enterPhase → phase_entry+1（TEST-271 锁定）。
6. **Replay**：`replayStateAt` 从 events 派生、spoken 按 actor_id 去重、**不读 messages**——多回合中同一参与者第二轮 `message_accepted` 不改变 spoken，回放视图无法区分轮次。**登记 F2-B3 处理**（本轮不引入新事件、不改回放）。
7. **F1-A phase_context**：battle 快照 = 每参与者最新 official + 秘书最新（既有语义）——**F2-B2 对称上下文的前置已就位（battle_round 身份），本轮不动**。
8. **Schema**：meeting.schema.json `pending_action.additionalProperties:true` + message.schema.json `extensions.additionalProperties:true` → battle_round **零 schema 变更、manifest 哈希不动**。

## 三、实现要点

- **`meeting-runtime.js`（304→328 行，既有文件登记增量）**：enterPhase/reenterPhase 各 +1 行初始化；`advanceBattleRound` 新 API（+24 行，含两个结构化拒绝：非 battle / 未完成）。
- **`message-commit.js`（74→94 行 ≤100 ✓）**：`battleRoundOf`（正整数才认，0=无回合概念）；`slotKey` 第四参；`findCommitted` round 精确过滤（undefined → 不过滤，兼容旧存档）；`commit` 回合权威 = `pendingAction.battle_round`（**Runtime 决定**，手工构造消息缺字段时归一补写，旧存档无回合 → 三元回退）；`message_accepted` 事件 payload 加 `battle_round`（审计链同构）。
- **`invocation-message-factory.js` / `mock-agent-runtime.js`**：条件写 `extensions.battle_round`（非 Battle 零字段）。
- **兼容矩阵**：新会话 battle（round=1..N 四元）· 新会话非 battle（三元，消息无 battle_round）· 旧存档恢复（pendingAction 无 battle_round → 三元回退，旧消息互配）——全链不破坏 F1-C 合同。

## 四、门禁与测试

- **Node 292/292**（282 → +10）：TEST-264 B1-01（首次=1/未完成拒绝）/ TEST-265 B1-02（slot 互异双 commit）/ TEST-266 B1-03（round1/2 不冲突 + A1 发言不自动开轮）/ TEST-267 B1-04（NO-OP）/ TEST-268 B1-05（DUP_SLOT）/ TEST-269 B1-06（checkpoint+archive+restore 不漂移，含恢复后 B1 补交）/ TEST-270 B1-07（round3 不误判）/ TEST-271 B1-08（human gate 回环 phase_entry=2 不冲突）/ TEST-272 B1-09（非 battle 三元回归 + 全 mock 多阶段零 battle_round）/ TEST-273 B1-10（human_decision_context 恒 null）。
- **Browser 363/363**（355 → +8）：F2B1-M01..M02e——真实 UI 全链（opening→summary→critique→human gate→battle）round1 落库带回合身份 + 事件 payload；`advanceBattleRound` 直调（**本轮禁 UI 按钮，Runtime API 模拟未来裁定链接线** + notify 刷新）→ UI 0/2 running → round2 A1 落库 slot 独立。
- **零 schema 变更** → manifest.sha256.json 不动；Offline 14/14 回归。

## 五、取舍登记

| 项 | 说明 |
|---|---|
| battle_round 挂 pendingAction | 与 phase_entry/phase_context 同路径，checkpoint/archive/restore 零改动自动携带；schema 开放袋合法 |
| advanceBattleRound 守卫 = ready_to_advance | 「本轮全部完成才可开下一轮」——禁止自动 +1 的显式化；B1 未完成时拒绝（TEST-264/266/269 锁定） |
| 事件 payload 加 battle_round | message_accepted 是审计链，slot 身份（含 round）可追溯；与 F1-C 事件含 turn 同构 |
| commit 归一补写 message.extensions.battle_round | Runtime 权威：调用方给不给 round 都归一为 pendingAction 值；杜绝「消息 round 与 Runtime round 不一致导致 satisfied 永假」 |
| Replay 多回合轮次不可区分 | 既有 spoken 去重语义，**登记 F2-B3**（重放完整性攻击轮）处理 |
| 旧存档兼容 | pendingAction 无 battle_round → 三元回退；F2-B3 补显式旧存档兼容测试 |

## 六、Git 证据

提交时输出 Branch/HEAD/origin/ahead/behind/worktree/stash/Commit Hash（GOVERNANCE.md 闭环）。
