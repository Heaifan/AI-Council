# Protocol Schema v0.1 — 字段冻结说明

> Schema 版本：`0.1.0`  
> JSON Schema：Draft 2020-12  
> 本文件标志着从“制度语义冻结”进入“机器合同冻结”。

## 1. 六个正式 Schema

```text
schemas/
├── protocol.schema.json
├── meeting.schema.json
├── role.schema.json
├── message.schema.json
├── artifact.schema.json
└── annotation.schema.json
```

所有 Schema 默认 `additionalProperties: false`。

未来需要扩展但尚未冻结的内容统一进入 `extensions` 或明确的开放字段，避免拼写错误被静默接受。

---

## 2. Protocol 核心字段

```text
schema_version
protocol_id
name
version
source
lifecycle_status
description
runtime_min_version
default_visibility_mode
allowed_visibility_modes
participant_policy
required_roles
initial_phase_id
phases[]
metadata
extensions
```

`phases[]` 冻结：

```text
phase_id
name
kind
actor
instruction
output_contract
completion
checkpoint
transitions[]
metadata
```

### phase.kind

```text
agent_turn
secretary_summary
critique
battle
human_gate
archive
system
```

### transition.trigger

```text
complete
human_choice
validation_failure
transport_failure
```

### 特别规则

`$end` 是唯一的协议终止目标。

Schema 负责结构合法性；以下必须由 Protocol Validator 做语义检查：

- `initial_phase_id` 必须存在；
- transition target 必须存在；
- phase_id 不能重复；
- Human Gate 必须由 `human_arbiter` 驱动；
- 必须存在从 initial 到 `$end` 的可达路径；
- 不应存在不可达 phase。

---

## 3. Meeting 核心字段

Meeting 是 D1 的**单 JSON 可恢复存档**。

冻结字段：

```text
meeting_id
title
status
protocol_snapshot
visibility_mode
seed
roles[]
participants[]
current_phase_id
completed_phase_ids[]
state_data
pending_action
events[]
messages[]
checkpoints[]
artifacts[]
annotations[]
branch
created_at
updated_at
extensions
```

### protocol_snapshot

必须保存：

```text
protocol_id
version
sha256
```

目的：运行中的会议不因磁盘 Protocol 修改而漂移。

### status

```text
initialized
running
waiting_human
paused
completed
failed
```

### transport_kind

Meeting participant 当前冻结：

```text
mock
api
local
web_relay
web_automation
```

---

## 4. Role 核心字段

Role 与 Model 分离。

```text
role_id
name
version
source
role_class
description
responsibilities[]
focus_areas[]
behavioral_constraints[]
task_guidance[]
metadata
extensions
```

`role_class`：

```text
advisor
chair
secretary
chair_secretary
```

---

## 5. Message 核心字段

```text
message_id
meeting_id
phase_id
event_seq
sender
recipients
identity_visibility_mode
content
references
validation
accepted_by_runtime
created_at
extensions
```

重要原则：

> 模型原始输出存在，不代表它已经成为正式会议事实。

只有 `validation` 合格且 `accepted_by_runtime=true` 后，才进入正式 Runtime 状态推进链。

---

## 6. Artifact

Artifact 类型**刻意不使用封闭 enum**。

原因：此前已冻结“Artifact 类型全集属于模块设计问题”。

因此只冻结：

```text
artifact_type = 可扩展规范字符串
```

并通过：

```text
created_by
provenance
parent_artifact_id
version
status
```

保持可追溯。

---

## 7. Annotation / Human Seal

冻结：

```text
annotation_kind:
- note
- highlight
- human_seal
```

Human Seal 必须携带：

```text
decision:
- accepted
- rejected
- accepted_with_reservations
```

原始记录与 Annotation 永远分离。

---

## 8. 为什么暂时没有 instruction.schema.json

D2 的 `InstructionPacket` 是下一阶段独立合同。

Phase 0 原计划中的六个 Schema 不包含它，因此本轮不偷跑第七个正式 Schema。

D2 开始前应单独冻结：

```text
instruction-packet.schema.json
```

这不会阻塞 D1 Protocol Kernel。

---

## 9. 版本规则

当前所有机器协议：

```text
schema_version = 0.1.0
```

Schema 自身与业务对象版本分离：

- `schema_version`：机器合同版本；
- `version`：具体 Protocol / Role 的内容版本。

v0.1 阶段不承诺向后兼容迁移器；一旦进入 D1 实现后，对字段做破坏性修改必须显式提升 Schema 版本。
