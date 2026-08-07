# D1-R4 Event Log / Checkpoint / Single JSON Persistence / Restore 开发报告

> 日期：2026-08-07
> 技术栈：HTML / CSS / JavaScript（Browser-first，无服务器、无后端、无 CDN；Node.js 仅用于自动测试）
> 基线：D1-R3 `c04e2dc`（53/53 PASS）

---

## 1. 当前阶段

| 项 | 值 |
| --- | --- |
| 轮次 | **D1-R4**（D1 协议内核最后一轮） |
| 主题 | Event Log / Checkpoint / Single JSON Persistence / Restore |
| 状态 | **COMPLETE** |
| 自动测试 | **84 / 84 PASS**（53 旧 + 31 新） |
| 正式 Schema | 6 份全部**零修改** |

本轮验收标准不是「UI 看起来正常」，而是**存储 → 销毁 → 恢复 → 继续运行**的闭环（TEST-82/83/84）。

## 2. TODO 执行情况

T01–T30 全部关闭。分组：
- T01–T05 基线确认 + 读现有模块 / Schema / JSON-safety 审计
- T06–T19 实现（诊断码、指纹、事件日志、Runtime 集成、检查点、存档、Schema 校验器、恢复语义校验器、序列化、浏览器 Save/Load、恢复、continue）
- T20–T22 新增 31 项测试 + 全量回归
- T23–T24 范围越界扫描 + Schema 完整性核对
- T25–T27 `file-tree.md` / `changelog.md` / 本报告
- T28–T30 commit / push / 远程一致性校验

## 3. Git 基线

- 起始 HEAD：`c04e2dc`（D1-R3 push 成功点）
- 起始 worktree：clean
- 分支：`main`

## 4. 实际修改文件（`git show --numstat`）

**新增（11）**

```
app/js/protocol-fingerprint.js              +93  -0
app/js/meeting-event-log.js                 +65  -0
app/js/meeting-checkpoint.js                +71  -0
app/js/meeting-archive.js                   +87  -0
app/js/meeting-schema-validator.js          +70  -0
app/js/meeting-restore-validator.js        +155  -0
app/js/meeting-persistence.js               +90  -0
app/js/meeting-restore.js                   +53  -0
app/js/meeting-persistence-ui.js           +130  -0
app/tests/protocol-test-cases-persistence.js +518 -0
reports/d1-r4-report.md                     （本文件）
```

**修改（10）**

```
app/index.html                    +32  -7
app/js/app.js                      +5  -0
app/js/meeting-runtime.js         +26  -0
app/js/meeting-factory.js         +13  -1
app/js/meeting-state.js           +10  -0
app/js/protocol-diagnostic.js     +20  -1
app/tests/run-node.js             +23  -1
app/tests/source-bundle.js         +6  -1
changelog.md                      +17  -0
file-tree.md                      +18  -7
reports/d1-r3-report.md            +4  -3   （上一轮 push 校验补记，随本轮一并提交）
```

合计：**21 files changed, 1506 insertions(+), 21 deletions(-)**（不含本报告）。

## 5. 本轮范围（只做这些）

Event Log、Checkpoint、Meeting Archive、Single JSON、Schema 校验、恢复语义校验、Save、Load、Restore、Continue。

## 6. 明确未做（禁止项，逐条确认）

| 禁止项 | 是否出现 |
| --- | --- |
| Replay Engine | 否 |
| Timeline UI | 否 |
| Branch / Git-like Meeting Branch | 否（`branch` 字段恒为 `null`，仅占位） |
| Artifact / Annotation Runtime | 否（数组恒为 `[]`） |
| Knowledge Base | 否 |
| InstructionPacket / Instruction Compiler | 否 |
| Prompt Compiler | 否 |
| WEB_RELAY / API / LOCAL / Web Automation Transport | 否 |
| 真实 LLM 调用 | 否（仅 MockAgentRuntime） |

扫描命令与结果见 §22。

## 7. MeetingState JSON 安全性

TEST-54 强制 `JSON.parse(JSON.stringify(meeting))` 深度等值。全状态树无 `Map` / `Set` / `Function` / `Promise` / DOM / `File` / `FileSystemHandle` / class private field / 循环引用。

`meeting.seed` 由 `null` 改为确定性默认 `0`：`meeting.schema.json` 中 `seed` 为 `required + integer + minimum:0`，`null` 会直接产出**无法通过 Schema 的存档**。这是本轮唯一一处对 D1-R3 状态模型语义的调整，已在 Factory / Archive / Restore 三处统一规范化。

## 8. Protocol Canonical Fingerprint

- Canonical JSON：对象键名**升序稳定排序**、数组**保持原序**、无空白、UTF-8。
- 摘要：Web Crypto `crypto.subtle.digest("SHA-256", bytes)`，浏览器与 Node 22 走**同一条代码路径**。
- Crypto 不可用时抛出 `PERSISTENCE_CRYPTO_UNAVAILABLE`，**绝不伪造哈希**。
- TEST-67：键序不同的同一份协议 → Canonical JSON 与 SHA-256 完全一致。
- TEST-68：改写 `transitions[].target` → 指纹必变。

## 9. Event Log 模型

```
{ event_id: "evt-000000", seq: 0, event_type, phase_id, actor_type, actor_id, payload, occurred_at }
```

- Append-only，`seq` 严格 `0..N-1`（TEST-61），旧事件内容不可变（TEST-62）。
- 事件类型：`meeting_started` / `phase_entered` / `agent_output_received` / `phase_completed` / `checkpoint_created` / `human_decision` / `meeting_completed` / `meeting_failed`。
- 时钟可注入（`setClock`），测试中固定为常量以保证确定性。
- `meeting.events` 缺失 → `PERSISTENCE_EVENT_LOG_UNAVAILABLE`。

## 10. Checkpoint

- 触发：进入 `checkpoint === true` 的 Phase、且状态已稳定之后。
- 顺序：先 append `checkpoint_created` 事件 → 用该事件的 `seq` 作为 `at_event_seq`（TEST-64）。
- `state_snapshot` 为深拷贝（JSON round-trip），后续状态变化不污染旧快照（TEST-65）。
- Human Gate 进入时必然留下 `waiting_human` 快照（TEST-66）。
- `checkpoint === false` 的 Phase 不建检查点（TEST-63）。

## 11. Meeting Archive（单 JSON）

文件名 `<meeting-id>.meeting.json`，`JSON.stringify(archive, null, 2)`，人类可读。字段完全对齐 `meeting.schema.json`（`additionalProperties:false`）。

**Runtime Model ≠ Archive DTO** 的两处映射：

1. `role_id`：Runtime 允许 `null`，Schema 要求非空 pattern 字符串 → 回退 `participant_id`。
2. `seed`：非法/缺省一律规范化为 `0`。

`messages` / `artifacts` / `annotations` 恒为 `[]`，`branch` 恒为 `null`（TEST-70）。

## 12. Meeting Schema Validator

`meeting.schema.json` 通过相对 `$ref` 引用 `role/message/artifact/annotation`，因此五份 Schema 必须注册进**同一个** Ajv 2020 实例才能解析。缺件 → `PERSISTENCE_SCHEMA_PACK_INCOMPLETE`；校验失败 → `PERSISTENCE_ARCHIVE_SCHEMA_INVALID` / `SCHEMA_VALIDATION_FAILED`（保留全部错误，不止第一条）。

## 13. Restore 语义校验（Schema PASS 之后仍要过的门）

| 检查 | 失败码 |
| --- | --- |
| Protocol（id+version）存在 | `RESTORE_PROTOCOL_NOT_FOUND` |
| Protocol 指纹一致 | `RESTORE_PROTOCOL_FINGERPRINT_MISMATCH` |
| `current_phase_id` / checkpoint phase 存在 | `RESTORE_PHASE_NOT_FOUND` |
| 事件 `seq` 连续 | `RESTORE_EVENT_SEQUENCE_INVALID` |
| 事件 ID 唯一 | `RESTORE_DUPLICATE_EVENT_ID` |
| Checkpoint `at_event_seq` 指向真实事件 | `RESTORE_CHECKPOINT_EVENT_NOT_FOUND` |
| 参与者 ID 唯一 | `RESTORE_DUPLICATE_PARTICIPANT_ID` |
| Role 引用存在 / role_class 匹配 | `RESTORE_ROLE_NOT_FOUND` / `RESTORE_ROLE_CLASS_MISMATCH` |
| Pending Action 与 Phase 一致 | `RESTORE_PENDING_ACTION_INVALID` |
| 状态一致（running/waiting_human/completed） | `RESTORE_STATE_INCONSISTENT` |

**任何一项失败即整体拒绝，绝不自动修复坏存档。**

## 14. 原子恢复

Candidate → Validate → Commit。校验未全过之前不触碰当前会议；失败时原会议**完全不受影响**。恢复成功后：
- **绝不重新 `start()`**（TEST-81）
- 不重跑已完成 Phase
- 保留部分响应（TEST-75：A1 已收、B1 仍在等）

## 15. 浏览器 Save / Load

- Save：`Blob` + `<a download>`；Object URL **惰性回收**（下次保存时 revoke）。项目静态审计（TEST-10）禁止 `setTimeout` / `setInterval` / `requestAnimationFrame`，因此不使用任何定时器；也不在 `click()` 后立即 revoke（部分浏览器会中断下载）。
- Load：`<input type=file accept=.json>` → `File.text()`。
- **不使用 localStorage / IndexedDB 作为正式存档**，不做 autosave，不做「最近打开」菜单。

## 16. Diagnostic Codes（本轮新增 16 个）

```
PERSISTENCE_JSON_PARSE_FAILED        PERSISTENCE_SCHEMA_PACK_INCOMPLETE
PERSISTENCE_ARCHIVE_SCHEMA_INVALID   PERSISTENCE_CRYPTO_UNAVAILABLE
PERSISTENCE_EVENT_LOG_UNAVAILABLE
RESTORE_PROTOCOL_NOT_FOUND           RESTORE_PROTOCOL_FINGERPRINT_MISMATCH
RESTORE_PHASE_NOT_FOUND              RESTORE_EVENT_SEQUENCE_INVALID
RESTORE_DUPLICATE_EVENT_ID           RESTORE_CHECKPOINT_EVENT_NOT_FOUND
RESTORE_DUPLICATE_PARTICIPANT_ID     RESTORE_ROLE_NOT_FOUND
RESTORE_ROLE_CLASS_MISMATCH          RESTORE_PENDING_ACTION_INVALID
RESTORE_STATE_INCONSISTENT
```

沿用既有 `ProtocolDiagnostic` 结构（`code / severity / filePath / protocolId / protocolVersion / jsonPath / message / details`），未另起体系。

## 17. 自动测试

```
node app/tests/run-node.js
总计 84 · 通过 84 · 失败 0
```

| 区段 | 覆盖 |
| --- | --- |
| TEST-01..31 | D1-R1/R2 Loader / Schema / Registry / Session / 语义校验（无回归） |
| TEST-32..53 | D1-R3 确定性 Runtime（无回归） |
| TEST-54 | MeetingState 完全 JSON-safe |
| TEST-55..60 | 六类事件各自被正确记录 |
| TEST-61..62 | seq 连续 / append-only |
| TEST-63..66 | Checkpoint 触发 / at_event_seq / 深拷贝 / Human Gate 快照 |
| TEST-67..68 | Canonical Hash 稳定性与敏感性 |
| TEST-69..72 | Archive 字段完整性 / 空数组 / Schema PASS / 缺字段 FAIL |
| TEST-73 | Serialize → Parse 等价 |
| TEST-74..75 | Save→Restore 恢复 waiting_human / 部分响应 |
| TEST-76..80 | 五类 Restore 拒绝路径 |
| TEST-81 | 恢复 completed 会议不得重新 start |
| **TEST-82** | **E2E：SAVE → DESTROY → LOAD → CONTINUE → $end** |
| **TEST-83** | **E2E：Restore 后 Continue Cycle 正确** |
| **TEST-84** | **E2E：Restore 后 Battle 正确** |

### 首轮 3 项失败与修复

| 用例 | 原因 | 修复 |
| --- | --- | --- |
| TEST-10 静态审计 | `meeting-persistence.js` 用了 `setTimeout` 回收 Object URL，命中禁止 API 清单 | 改为惰性回收（下次保存时 revoke），零定时器 |
| TEST-71 Archive Schema | `seed` 为 `null`，而 Schema 要求 `integer + minimum:0` | Factory 默认 `seed=0`；Archive/Restore 统一规范化 |
| TEST-77 指纹不一致 | 测试自身写错：把 `phases[0].transitions[0].target` 改成 `"summary"`，而它**本来就是** `"summary"`，等于没改 | 改为篡改 `phases[0].instruction.task`（仍 Schema+Semantic 合法，但 Canonical JSON 必变） |

## 18. 是否修改正式 Schema

**否。** `git diff c04e2dc -- schema/` 为空，`schema/schemas/` 6 份文件零改动。

## 19. 是否实现 D2 内容

**否。** 无 InstructionPacket、无 Prompt 编译、无 Transport、无真实模型调用。

## 20. Commit 前检查

- [x] `node app/tests/run-node.js` → 84/84 PASS
- [x] `schema/` 无 diff
- [x] 范围越界扫描通过
- [x] `file-tree.md` / `changelog.md` 已同步
- [x] 无临时调试文件残留

## 21. Git 最终状态

- Branch：`main`
- Commit message：`D1-R4: add meeting persistence and restore`
- HEAD：`72051aa9456428835c30e692f14c87ddf8e65bf7`（短 `72051aa`）
- Remote main（`git ls-remote origin main` 权威校验）：`72051aa9456428835c30e692f14c87ddf8e65bf7` = HEAD，**已 push 成功**
- Ahead/Behind：0/0；Worktree：clean
- 提交规模：22 files changed（含本报告 +302），`+1808 / -21`

## 22. 范围越界扫描

```
grep -rniE "replay|timeline|branchengine|git-like|InstructionPacket|InstructionCompiler|
            PromptCompiler|WEB_RELAY|webRelay|openai|anthropic|apiKey|fetch\(|
            XMLHttpRequest|WebSocket" app/js app/tests --include=*.js -l
→ app/tests/protocol-test-cases-session.js
```

唯一命中是 TEST-10 **自身的禁止 API 清单常量**（`FORBIDDEN_APIS`），属于守卫代码而非违规实现。其余零命中。

## 23. 浏览器验收面板

`app/index.html` 新增持久化面板，展示 Status / Current Phase / Events / Checkpoints，提供 Create Demo Meeting / Save / Load 三个按钮。`meeting-persistence-ui.js` **仅浏览器加载**，不进 `run-node.js`，避免把 DOM 依赖带进 Node 测试。

## 24. 当前已知问题

1. **无 Role Registry。** `committee-mvp` 协议不含 `roles`，故 Archive 的 `roles` 为 `[]`（Schema 无 `minItems`，合法）；恢复时 Role 交叉校验在 `roles` 为空时**跳过**。`RESTORE_ROLE_NOT_FOUND` / `RESTORE_ROLE_CLASS_MISMATCH` 两个码已实现但在当前协议下不会触发。补齐需要 D2 引入 Role Card 装载。
2. **`role_id` 回退。** Runtime 参与者 `role_id` 可为 `null`，存档时回退到 `participant_id`。恢复后 `role_id` 不再是 `null`，属于有意的 DTO 规范化，非数据损坏。
3. **真机验收未跑。** 本轮为自动测试闭环，Chrome/Edge 双击真机验收（A01–A10）需人工执行，清单见 §25。

## 25. 人工真机测试清单（Chrome / Edge 各一遍）

| # | 步骤 | 期望 |
| --- | --- | --- |
| A01 | 双击 `app/index.html` | 页面正常，无 CDN / 无网络请求 |
| A02 | 选择 `protocols/` 目录 | Available 出现 committee-mvp |
| A03 | 点 Create Demo Meeting | Status=waiting_human，Phase=human-decision |
| A04 | 观察 Events / Checkpoints 计数 | Events 递增且连续，Checkpoints ≥ 1 |
| A05 | 点 Save | 下载 `<meeting-id>.meeting.json`，可读、缩进 2 空格 |
| A06 | 刷新页面（销毁内存状态） | 面板回到空态 |
| A07 | 点 Load 选刚才的文件 | 恢复到 waiting_human / human-decision，事件与检查点数一致 |
| A08 | 恢复后点 continue / finish 继续推进 | 会议正常走到 `$end`，状态 completed |
| A09 | 手工把存档里某个 `seq` 改乱再 Load | 明确拒绝并显示 `RESTORE_EVENT_SEQUENCE_INVALID`，当前会议不被破坏 |
| A10 | 手工改协议内容后再 Load 旧存档 | 明确拒绝并显示 `RESTORE_PROTOCOL_FINGERPRINT_MISMATCH` |

## 26. D1 最终验收

D1 协议内核四轮全部关闭：

| 轮次 | 主题 | 测试 |
| --- | --- | --- |
| D1-R1 (+F1) | Protocol Registry / Loader / Schema / Session 冻结 | 15 |
| D1-R2 | Protocol Semantic Validator | 31 |
| D1-R3 | Meeting State Machine / Deterministic Runtime | 53 |
| **D1-R4** | **Event Log / Checkpoint / Persistence / Restore** | **84** |

至此「协议驱动 · 人类终裁 · 可验证 · 可恢复 · 可回放」中的**可验证**与**可恢复**已落地；**可回放**（Replay）留给后续轮次，本轮明确不做。

**D1 状态：CLOSED。**

## 27. 下一步建议

立即切到 **D2 指令编译器（Instruction Compiler）**，不再扩 D1。D2 的合理起点：

1. `InstructionPacket` 数据结构定义（Phase + Role Card + 上下文范围 + 可见性规则 + 输出契约 → 一个确定性数据包）。
2. Instruction Compiler：`(Protocol, Meeting, Phase, Participant) → InstructionPacket`，必须 100% 确定性、可快照、可测试。
3. 引入 Role Card 装载，顺带把 §24-1 的 Role Registry 缺口补上。
4. Prompt 渲染（`InstructionPacket → 文本`）建议单独一轮，与编译器解耦。
5. Transport 抽象（含 WEB_RELAY）再往后放，先保证「编译产物可被人肉检查」。
