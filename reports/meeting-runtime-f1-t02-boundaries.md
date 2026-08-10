# MEETING-RUNTIME-F1 · T02 权威边界冻结

> 用户四项修正冻结后输出的一页边界确认（映射到真实文件/函数，无第二套权威源）。

## 权威链（唯一真相路径）

```
Protocol（只决定规则）
  schema/schemas/protocol.schema.json + app/js/meeting-factory.js:buildPhaseMap
  → phase.actor / completion.mode / transitions
        ↓  enterPhase（meeting-runtime.js:82-95，唯一解析点）
Phase Roster（单一权威，无副本）
  resolveParticipants(phase.actor, meeting) → MeetingAction.collectResponses
  → pendingAction.requiredParticipantIds
  ※ 已 grep 全仓确认：唯一写入点 = meeting-runtime.js:95（enterPhase）；
     phase 生命周期内零重解析、零 push/splice → 它就是本阶段冻结 roster。
  → getRoundRoster() = pendingAction.requiredParticipantIds（语义包装，不存第二份数组）
        ↓
Meeting Runtime（新增状态机）
  ├─ meeting.activeSpeakerId        ← 唯一持久游标（enterPhase 置 roster[0]；accept 后推进）
  ├─ admission                      ← meeting-admission.js（纯函数：admitted/blocked，Runtime Admission 层）
  ├─ effective responses            ← pendingAction.receivedParticipantIds（add=accept / remove=revoke；权威）
  ├─ derived（不存储）: pending/completed/progress/phaseStatus(RUNNING|READY_TO_ADVANCE)
  ├─ phase advance                  ← 显式 advancePhase()（仅用户点击「进入下一阶段」；submitResult 不再自动切）
  └─ 历史事实（事件即真相，追加不修改）
       agent_output_received（已有）
       agent_output_revised / agent_output_revoked（新增，supersedes/target 载荷）
       展示层 meeting.messages.extensions = {response_status, revision, supersedes_message_id}
       ※ message.schema.json extensions 是 additionalProperties:true 开放袋 → 零 schema 变更
       ※ 存档不含 messages（meeting-archive.js messages:[]）→ 事件是持久真相，messages 仅 UI 投影
        ↓
Replay（顺序消费事件，必须与 Live 一致）
  app/js/harness/meeting-replay.js:replayStateAt
  → spoken = 有效 official 集合（received 事件 − revoked 事件）
  → pending/progress/activeSpeaker 派生 → 与 Live 一致性测试（修正 4 硬要求）
        ↓
UI（纯投影）
  selectedSeat（seat-local-config.js）← 单向同步：Runtime 导航时跟随 activeSpeaker；
                                    用户手工点击只改查看对象，永不改 activeSpeaker
  seat-status.js（已发言/当前/等待/阻塞）
  底部导航（← 上一席 | 当前 A2 · 2/6 | 下一席 →；6/6 时 [进入下一阶段]）
  Mock「模拟下一席响应」回开发工具区（meeting-navigation 语义断开）
```

## 冻结的不可变点

1. Protocol 零改动；phase.actor/completion/transitions 是唯一名单与完成规则来源。
2. `requiredParticipantIds` = Phase Roster，**禁止第二份可变数组**（用户修正 1）。
3. pending/completed/progress/nextSpeaker 全部派生（用户修正 2）：`pending = roster.filter(id => !received.includes(id))`。
4. 6/6 → `READY_TO_ADVANCE` 停住，**不自动 enterPhase**（用户修正 3）；撤回 → 回 RUNNING。
5. 修改/撤回 = 追加事件，Live 与 Replay 最终状态必须一致（用户修正 4）。
6. Admission 只证明「配置就绪」（admitted/blocked）；externalReady 留接口，不假装 online（用户修正 11 条）。
7. Mock 模拟与会议导航从语义与 UI 两边断开（用户修正 12 条）。

## 待办登记

- messages.extensions 字段命名：`response_status: "official"|"superseded"|"revoked"`、`revision: 1..n`、`supersedes_message_id`。
- 事件载荷：revised = {participant_id, target_message_id, supersedes_message_id, revision}；revoked = {participant_id, target_message_id}。
- 既有测试适配面（自动切阶段 → READY_TO_ADVANCE）：WR-05、stepUntil 系列、meeting-replay TEST-169、Browser D/S/F/R/L 系列 step 链——统一在测试辅助 stepUntil 与对应 Browser 流程中显式 advancePhase。
