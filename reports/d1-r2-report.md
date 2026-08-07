# D1-R2 Protocol Semantic Validator 开发报告

> 阶段：D1-R2 — Protocol Semantic Validator（COMPLETE）
> 技术栈：HTML / CSS / JavaScript（纯浏览器，无服务器、无后端、无 CDN、无构建）
> 原则：确定性、不修改正式 Schema、不越界到 D1-R3 / D2

## 1. 当前阶段

D1-R2 Protocol Semantic Validator 已完成。系统从「判断 JSON 格式是否合法」升级为「判断这套会议规则逻辑上能否被会议 Runtime 执行」。

- Phase 0 ✅ CLOSED
- Schema v0.1 ✅ CLOSED
- D1-R1 Loader / Registry ✅ CLOSED（D1-R1-F1 收口）
- **D1-R2 Semantic Validator ✅ COMPLETE（本轮）**
- D1-R3 Meeting State Machine / Runtime ⬜ NEXT

## 2. TODO

T01–T22 全部完成。其中浏览器交互式真机验收（类 F1 的 A01–A06）本环境无法执行，如实记为 NOT RUN，逻辑层由 31/31 Node 测试 + 静态审计覆盖。

## 3. Git 基线

- 基线：main @ `0832aac`（D1-R1-F1）
- D1-R2 后 HEAD：见仓库最新 main HEAD（commit 后生成，push 后 HEAD == origin/main）

## 4. 实际修改文件

新增：

- `app/js/protocol-semantic-validator.js` — D1-R2 语义校验核心
- `app/tests/protocol-test-cases-semantic.js` — TEST-16..TEST-31
- `reports/d1-r2-report.md` — 本报告

修改：

- `app/js/protocol-diagnostic.js` — 冻结 14 个 `SEMANTIC_*` 诊断码
- `app/js/protocol-registry.js` — `classify` / `build` 注入 Semantic Gate
- `app/js/protocol-session.js` — 向 `build` 传入 `A.ProtocolSemanticValidator`
- `app/tests/run-node.js` — RUNTIME / AUDITED 增加语义模块与语义测试文件
- `app/index.html` — 加载脚本 + 页眉/脚注更新为 D1-R2
- `app/tests/protocol-test-cases.js` — TEST-11 随语义启用反向（计划预期）
- `file-tree.md` / `changelog.md` — 同步 D1-R2

删除：无。正式 `schema/` 文件均未改动。

## 5. Semantic Validator 架构

`protocol-semantic-validator.js` 暴露 `A.ProtocolSemanticValidator.validate(parsed) → { valid, diagnostics[] }`。返回的 `diagnostics` 为原始 `{ code, jsonPath, message, details }`，由 `ProtocolRegistry.classify` 用 `D.create` 包裹成 `ProtocolDiagnostic` 并附 `filePath / protocolId / protocolVersion`。

职责单一：只做「关系与流程」语义判断，**不碰结构**（结构属于 Schema Validator），**不修改 Protocol**，**不做任何 LLM 判定**。

## 6. Validation Pipeline

```text
JSON.parse()
   ↓
SchemaValidator.validate()        → FAIL: Quarantine(SCHEMA_VALIDATION_FAILED)
   ↓ Schema PASS
SemanticValidator.validate()      → FAIL: Quarantine(SEMANTIC_*)
   ↓ Semantic PASS
Registry → Available
```

语义非法的 Protocol 与 Schema 非法的 Protocol 走同一 `quarantine` 通道，UI（registry-view + diagnostic-view）无需改动即展示 Semantic Diagnostic Code / JSON Path / 消息。

## 7. 已实现 Semantic Rules

### S01 Duplicate Phase — `SEMANTIC_DUPLICATE_PHASE_ID`
`$.phases[i].phase_id` 与更早的同名 phase 冲突。

### S02 Initial Phase — `SEMANTIC_INITIAL_PHASE_NOT_FOUND`
`$.initial_phase_id` 不存在于 `phases[].phase_id`。

### S03 Transition Target — `SEMANTIC_TRANSITION_TARGET_NOT_FOUND`
`$.phases[i].transitions[j].target` 既不是 `$end` 也不存在于 phase 集合。

### S04 Human Gate Actor — `SEMANTIC_HUMAN_GATE_ACTOR_INVALID`
`kind === "human_gate"` 时 `actor.selector` 必须为 `human_arbiter`。

### S05 Human Gate Completion — `SEMANTIC_HUMAN_GATE_COMPLETION_INVALID`
`kind === "human_gate"` 时 `completion.mode` 必须为 `human_decision`。

### S06 Reachability — `SEMANTIC_UNREACHABLE_PHASE`
从 `initial_phase_id` 出发经合法 transition 无法到达的 phase。

### S07 $end Reachability — `SEMANTIC_END_NOT_REACHABLE`
从 `initial_phase_id` 出发不存在任何通往 `$end` 的路径（合法循环允许，但必须至少一条结束路径）。

### S08 Side Rules
- `SEMANTIC_SIDE_ID_DUPLICATE` — side_id 重复
- `SEMANTIC_SIDE_MEMBER_RANGE_INVALID` — `min_members > max_members`
- `SEMANTIC_SIDE_CAPACITY_INVALID` — `sum(max_members) < min_advisors` 或 `sum(min_members) > max_advisors`

### S09 Role Rules
- `SEMANTIC_REQUIRED_ROLE_DUPLICATE` — role_class 重复
- `SEMANTIC_REQUIRED_ROLE_RANGE_INVALID` — `min_count > max_count`
- `SEMANTIC_ADVISOR_POLICY_CONFLICT` — advisor 角色区间与 `participant_policy` 顾问区间无可行交集

### S10 Visibility Rules
- `SEMANTIC_DEFAULT_VISIBILITY_NOT_ALLOWED` — `default_visibility_mode` 不在 `allowed_visibility_modes` 中

## 8. Graph Algorithm

- `phaseIds`：`Object.create(null)` 索引，`O(P)`。
- `adj`：邻接表 `phase_id → [target]`，`O(T)`。
- BFS：显式 `stack` + `visited` Set，复杂度 **O(P + T)**，无递归、无 O(P×T) 全扫描。
- `$end` 作为终止符不计入 `visited`，仅通过 `endEdges` 记录「是否存在从某 phase 出发抵达 $end 的边」。

## 9. Cycle 处理

合法循环（如 `human-decision ↔ critique`）被 BFS 正常遍历，`visited` 去重保证不死循环；`$end` 可达性只看是否存在从可达 phase 出发的 `$end` 边。因此：

- 循环本身**不是错误**；
- 仅当**无任何路径抵达 `$end`** 时才拒绝（S07）。

TEST-20（无 `$end` 边 → S07，且不误报不可达）/ TEST-21（含合法循环 → Semantic PASS）覆盖此行为。

## 10. Diagnostic Codes

14 个 `SEMANTIC_*` 码全部在 `protocol-diagnostic.js` 的 `CODE` 中冻结，复用既有 `ProtocolDiagnostic` 体系，未造第二套错误对象。

## 11. Multi-error 行为

Validator 不 fail-fast，单次遍历收集全部诊断。TEST-31 验证一次返回重复 phase + transition target 不存在 + human gate actor 错 + side range 错 共 4+ 类不同码。

## 12. Registry Integration

`protocol-registry.js` 的 `classify` 在 Schema PASS 之后调用 `semanticValidator.validate(r.parsed)`；失败则 `quarantine` 并携带语义诊断。原有 `Available / Invalid` 分流、重复检测、冻结逻辑不变。

## 13. 自动测试

旧：15/15（TEST-01..15）

新增：TEST-16..TEST-31（16 项）

- 原 15 项中，TEST-11 的断言随 D1-R2 语义启用而**反向**（计划预期：语义非法示例从「通过」变为「被拒」），其余 14 项断言不变；
- 新增 TEST-16（合法 mvp）、TEST-17（重复 phase）、TEST-18（initial 缺失）、TEST-19（不可达 phase）、TEST-20（$end 不可达）、TEST-21（合法循环）、TEST-22/23（Human Gate actor/completion）、TEST-24（重复 side）、TEST-25（side min>max）、TEST-26（side 容量）、TEST-27（重复 role）、TEST-28（role min>max）、TEST-29（visibility）、TEST-30（advisor 冲突）、TEST-31（多错误一次返回）。

最终：**31/31 PASS**（`node app/tests/run-node.js`）。

## 14. 是否修改正式 Schema

**NO**。6 个 schema 文件（`protocol` / `role` / `meeting` / `message` / `artifact` / `annotation`）均未触碰；`protocol.schema.json` SHA-256 保持 `4573e2cb64019607e5f28417a1112e10fc62dcb32326301a668209f31b3d1f06` 不变。

## 15. 是否实现 D1-R3

**NO**。`grep` 确认 `app/` 中无 `MeetingState` / `MeetingRuntime` / `InstructionCompiler` / `MockAgent` / `WebRelay` / `Checkpoint` / `Replay` / `Branch` 等 D1-R3 / D2 实现。

## 16. 是否存在范围外开发

**NO**。

## 17. Git 最终状态

- Branch：main
- HEAD：见仓库最新 main HEAD
- origin/main：同 HEAD（已 push）
- Ahead/Behind：0/0
- Worktree：clean

## 18. 当前已知问题

1. 计划 D1-R2 §21 给出的期望 Schema 哈希 `9a918754…` 与本仓库实际 `4573e2cb…` 不一致（与 D1-R1-F1 发现一致，属计划文档引用过期，非本轮改动）；本轮未修改任何 schema 文件。
2. 浏览器交互式真机验收因本环境无 headless 浏览器未执行，逻辑层已由 31/31 Node 测试 + TEST-10 静态审计（无网络/轮询/CDN）覆盖；交互式 GUI 验收需人工在 Chrome/Edge 中按 D1-R2 场景复核。

## 19. D1-R2 状态

**COMPLETE**

## 20. 下一步

**D1-3 Meeting State Machine / Deterministic Runtime** —— 创建 `Meeting State`，让程序按照这张经过验证的 Phase Graph 向前推进。
