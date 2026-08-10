# MEETING-INTEGRITY-F1-A · Phase Context Snapshot — 2026-08-10

> 轮次：MEETING-INTEGRITY-F1-A（总方案 MEETING-INTEGRITY-F1 的第一轮，按用户开发顺序只做 F1-A）
> 目标：修「独立发言不独立」——同 Phase 上下文污染。
> 门禁：Node 244/244 · Browser 332/332 · Offline 14/14 · Schema PASS · diff --check PASS

## 一、F1-01 审计结论（先查后改）

**上下文注入唯一入口** = `RelayFlow.open`（relay-flow.js:65-66），每次打开 relay 工作区时实时提取：

```js
previousResponses: MeetingResponseState.effectiveResponses(meeting),
secretarySummary:   MeetingResponseState.secretarySummary(meeting)
```

`effectiveResponses` 的缺陷（审计实证）：

1. **不分阶段**：遍历所有 participants 取各自 `latestOfficial`（messages 数组序最后一条 official），不按 phase_id 过滤 → 同阶段污染：
   - opening：A1 accept 后 B1 打开 → B1 看到 A1 本轮 opening（错误）
   - critique：A1 accept critique 后 B1 打开 → B1 看到 A1 的 critique（错误）
2. **latestOfficial 覆盖**：跨多阶段时每人只取最新一条 → critique 阶段看不到 A1 的 opening 原文（上下文丢失，秘书汇总「失真」的根因之一）。
3. Runtime `enterPhase` 无任何上下文冻结概念；mock 路径（stepOnce）不编译 prompt，不受影响；CompilerView 裸编译不注入，不受影响。

## 二、实现

### 新模块 `app/js/harness/phase-context-snapshot.js`（85 行 ≤100 红线）

- `create(meeting, protocol, phaseId)`：进入 Phase 瞬间冻结可见上下文引用（**只存 message_id，不复制大段文本**，符合方案「引用哪些正式 Message」原则）。
- 上下文政策（用户方案逐字执行）：
  - `agent_turn`（opening）→ 空引用（完全独立）
  - `secretary_summary` → 已完成阶段（completedPhaseIds）全部委员 official 发言
  - `critique` → 已完成阶段全部 official（Opening + 秘书汇总），同阶段 critique 天然不在引用集
  - `battle` → 保持既有语义（每参与者最新 official + 秘书最新汇总，F2 再议）
- `resolve(meeting, snapshot)`：引用 → CompileFlow extras（与 F5 形状一致 `{participant_id, alias, text, responseId}`）。
- `fromPending(meeting)`：读 `pendingAction.phase_context`（防御 null）。

### 挂载（零 schema 变更）

- `meeting-runtime.js` `enterPhase` + `reenterPhase`：pendingAction 建立后挂 `phase_context`。
- 承载点选择：`pending_action` 在 meeting.schema.json 为 `additionalProperties:true`，checkpoint `state_snapshot` 深拷贝、archive DTO、restore 均原样携带 → **不改 meeting.schema.json / manifest 哈希**，S04 恢复后引用集逐字一致（TEST-221 实测）。

### 消费端

- `relay-flow.js` `open`：优先从 snapshot 解析 extras；无 snapshot（旧存档/回放投影）回退实时提取（兼容旧行为；回放视图只读不编译，无实际泄漏路径）。

### 测试

- Node `protocol-test-cases-integrity-f1a.js`（TEST-218..225 = S01..S08）：
  - S01/S02 opening 双向独立（0 命中）；S03 critique 可见 Opening+秘书汇总、不可见同阶段 critique；S04 存档恢复后 Snapshot 对象逐字一致 + 恢复后重复 S03 隔离语义；S05 秘书输入保留；S06 battle 现状；S07 旧存档回退；S08 引用集进入时刻冻结。
- Browser `runF1A`（F1A-S01..S03b，5 条）：全真实中继链 A1→B1→秘书→critique，B1 Prompt 逐字断言（不含 A1 opening / 含 Opening+秘书汇总 / 不含 A1 critique）。

## 三、取舍与跨轮依赖登记

| 项 | 说明 |
|---|---|
| messages 未落库（archive DTO `messages: []` 恒空） | F1-C 修复项。F1-A 的 S04 验收到「Snapshot 引用一致 + 恢复后隔离语义」；恢复后「可见 Opening 原文」断言在 F1-C 交付后升级 |
| battle 上下文 | 按方案保持现状（F2-B 专门处理对称语义） |
| `human_decision_context` 字段 | 方案数据结构保留，T0 不实现（恒 null） |
| 回放投影 | replayStateAt 重建的 pendingAction 无 phase_context → 走回退路径；回放视图只读，无编译泄漏 |

## 四、Git 证据（GOVERNANCE.md 闭环）

提交时输出：Branch/HEAD/origin/ahead/behind/worktree/stash/Commit Hash（见提交说明）。
