# Protocol Schema v0.1 — Validation Report

> 状态：PASS  
> Schema 版本：0.1.0  
> JSON Schema：Draft 2020-12

## 1. 本轮目标

把 Phase 0 的制度语义转换为 D1 可直接消费的机器合同，并验证：

- 6 个正式 Schema 可加载；
- 合法对象可通过；
- 结构错误可拒绝；
- Protocol 语义错误可拒绝；
- Meeting 跨对象引用错误可拒绝；
- Protocol Snapshot 漂移可识别。

## 2. 正式 Schema

```text
protocol.schema.json
meeting.schema.json
role.schema.json
message.schema.json
artifact.schema.json
annotation.schema.json
```

## 3. 验证结果

```text
[PASS] valid-role-strategic-advocate.json vs role.schema.json
[PASS] valid-role-risk-challenger.json vs role.schema.json
[PASS] valid-role-chair-secretary.json vs role.schema.json
[PASS] valid-message.json vs message.schema.json
[PASS] valid-artifact.json vs artifact.schema.json
[PASS] valid-annotation.json vs annotation.schema.json
[PASS] valid-protocol-committee-mvp.json vs protocol.schema.json
[PASS] valid-meeting-resume-demo.json vs meeting.schema.json
[PASS] invalid-protocol-schema.json vs protocol.schema.json
[PASS] invalid-meeting-semantic.json vs meeting.schema.json
[PASS] valid protocol semantic validation
[PASS] invalid semantic protocol rejected
  - detected: opening: transition target not found: phase-does-not-exist
  - detected: unreachable phase: archive
  - detected: unreachable phase: battle
  - detected: unreachable phase: critique
  - detected: unreachable phase: human-decision
  - detected: unreachable phase: summary
  - detected: $end is not reachable from initial_phase_id
[PASS] valid meeting cross-schema validation
[PASS] invalid semantic meeting rejected
  - detected: protocol_snapshot.sha256 mismatch
  - detected: participant agent-a1: role_id not found: missing-role
  - detected: event seq must be contiguous 0..N-1, got [0, 0, 2]
  - detected: message msg-0001: meeting_id mismatch
RESULT: PASS
```

Validator 退出码：`0`

## 4. 已验证的关键不变量

### Protocol

- `initial_phase_id` 必须指向存在的 phase；
- `phase_id` 不得重复；
- transition target 必须存在或为 `$end`；
- Human Gate 必须由 `human_arbiter` 驱动；
- Human Gate completion 必须为 `human_decision`；
- initial 必须能够到达 `$end`；
- 不允许不可达 phase；
- side / role 数量上下限必须自洽；
- 默认 Visibility 必须属于 allowed modes。

### Meeting

- Protocol Snapshot 的 ID / version / canonical SHA-256 必须匹配；
- Participant 的 Role 必须存在，且 `role_class` 一致；
- Advisor / Side / Required Role 数量必须满足 Protocol；
- Event `seq` 必须从 0 开始连续递增；
- Message / Artifact / Annotation 必须属于当前 Meeting；
- Message / Artifact provenance / Annotation target 引用必须存在；
- `accepted_by_runtime=true` 的 Message 必须已经 `valid` 或 `corrected`；
- `waiting_human` 时当前 phase 必须是 `human_gate`。

## 5. Canonical Protocol Hash

Protocol Snapshot 的 `sha256` 不直接对磁盘文件字节求哈希，而对 Protocol JSON 做 canonical serialization 后求 SHA-256：

```text
UTF-8
sort_keys = true
separators = (",", ":")
ensure_ascii = false
```

这样仅缩进、换行变化不会导致会议错误判定 Protocol 漂移。

## 6. D1 入口

Schema v0.1 已足够支撑：

```text
Load Protocol
→ Schema Validation
→ Protocol Semantic Validation
→ Create Meeting
→ Deterministic Phase Advance
→ Event Log
→ Checkpoint
→ Save Single JSON
→ Restore
```

`InstructionPacket` 不在本轮六个正式 Schema 中；按既定阶段划分，在 D2 开始前单独冻结。
