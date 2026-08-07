# D2-R1 Instruction Compiler / Role Card Registry 开发报告

> 日期：2026-08-07
> 技术栈：HTML / CSS / JavaScript（Browser-first，无服务器、无后端、无 CDN；Node.js 仅用于自动测试）
> 基线：D1-R4 `d77ea9d`（84/84 PASS，D1 协议内核 CLOSED）
> 承接：D1-R4 报告 §27「下一步立即切 D2」

---

## 1. 当前阶段

| 项 | 值 |
| --- | --- |
| 轮次 | **D2-R1**（D2 指令编译器首轮） |
| 主题 | InstructionPacket 数据结构 / Instruction Compiler / Role Card Registry / Packet Schema 校验 |
| 状态 | **COMPLETE** |
| 自动测试 | **109 / 109 PASS**（84 旧 + 25 新，TEST-85..109） |
| 正式 Schema | 冻结 6 份**零修改**；新增 `instruction-packet.schema.json`（独立新文件） |

本轮验收标准：给定 `(Protocol, Meeting, Phase, Participant)` 能**确定性**地产出一个结构化的、可快照、可测试、可被人肉检查的 `InstructionPacket`；并通过 JSON Schema 校验。Prompt 文本渲染（D2-R2）与 Transport（D2-R3）**不做**。

## 2. TODO 执行情况

D2-R1 拆分为 6 个工程任务（对应任务看板 #94..#99），全部关闭：

- #94 定义 `InstructionPacket` 数据结构与 `instruction-packet.schema.json`
- #95 `RoleCardRegistry` 模块 + 示例 Role Card（`roles/advisor.json`、`roles/chair-secretary.json`），补 D1-R4 §24-1 的 Role Registry 缺口
- #96 `InstructionPacketSchemaValidator`（复用 `vendor/ajv2020.bundle.js`）
- #97 `InstructionCompiler`：确定性编译，复用 `Runtime._resolveParticipants` 与 `ProtocolFingerprint.canonicalize`
- #98 诊断码（7 个 `COMPILER_*`/`ROLE_*`）+ 测试 TEST-85..109 + `run-node.js` 接线
- #99 跑测试（109/109）+ 文档同步 + commit/push/verify

## 3. Git 基线

- 起始 HEAD：`d77ea9d`（D1-R4 push 成功点）
- 起始 worktree：clean
- 分支：`main`

## 4. 实际修改文件（`git show --numstat` 口径）

**新增（8）**

```
schema/schemas/instruction-packet.schema.json   +367  -0
app/js/instruction-compiler.js                  +183  -0
app/tests/protocol-test-cases-compiler.js       +348  -0
app/js/role-card-registry.js                    +75   -0
app/js/instruction-packet-schema.js             +63   -0
roles/advisor.json                              +28   -0
roles/chair-secretary.json                      +28   -0
schema/manifest.sha256.json                     +5    -0
```

**修改（4）**

```
app/js/protocol-diagnostic.js    +10  -1
app/tests/run-node.js            +11  -1
changelog.md                      +11  -0
file-tree.md                      +7   -1
```

合计：**12 files changed（不含本报告）, +1146 / -3**。

## 5. 本轮范围（只做这些）

InstructionPacket 数据结构、Role Card Registry/装载、Instruction Compiler（确定性编译）、InstructionPacket Schema 校验器、7 个诊断码、25 项新增测试。

## 6. 明确未做（禁止项，逐条确认）

| 禁止项 | 是否出现 |
| --- | --- |
| Prompt 文本渲染（InstructionPacket → 人读文本） | 否（留 D2-R2） |
| Transport / WEB_RELAY / API / LOCAL / Web Automation | 否（留 D2-R3） |
| 真实 LLM 调用 | 否（仅确定性编译，无模型） |
| Replay Engine / Timeline UI / Branch | 否（D1-R4 已明确不做） |
| 修改 Runtime / 让 Runtime 调用 Compiler | 否（Compiler 是解耦只读产出） |
| 修改冻结 6 份正式 Schema | 否（仅新增独立 `instruction-packet.schema.json`） |

## 7. InstructionPacket 数据结构

`InstructionPacket` 是一个 plain object，`additionalProperties:false`，字段：

```
schema_version, packet_id, compiler_version,
protocol { protocol_id, protocol_version },
meeting { meeting_id, visibility_mode },
phase { phase_id, phase_kind, phase_name },
target { participant_id, role_class, side_id, alias },
instruction { task, context_scope, context_keys, include_role_card, include_visibility_rules },
role_card (Role Card 对象 | null),
visibility ( { mode, allowed_modes, anonymous, rules_included } | null ),
output_contract { mode, required_sections?, json_schema? },
actor { selector, side_id?, role_class?, participant_ids?, selection_key? },
generated_at, deterministic:true
```

- 当 `instruction.include_role_card=false` → `role_card=null`；`include_visibility_rules=false` → `visibility=null`（协议显式控制 Agent 该看到什么，见 Role-Card-Spec §4）。
- 所有字段来自协议/会议/角色卡的**确定性透传或解析**，无任何随机性。

## 8. Role Card Registry

- `RoleCardRegistry.create(cards)`：轻量结构校验（role_id / role_class / name），建立 `role_class → [cards]` 映射。
- 同 `role_class` 多张卡片时按 `role_id` 升序**确定性 pick 第一张**，保证编译产物可复现。
- 与 Model Registry 解耦（Role-Card-Spec §1）：本模块只负责「角色职责卡」查找。
- 不依赖磁盘/浏览器 API：调用方把已解析的 Role Card 对象传入（测试注入 / 未来浏览器 loader 从 `roles/` 读取）。
- 示例卡 `roles/advisor.json`、`roles/chair-secretary.json` 符合 `role.schema.json`（TEST-89 用 Ajv 验证通过）。

## 9. InstructionPacket Schema 校验器

- `InstructionPacketSchemaValidator.create(packetSchema)`：用 `vendor/ajv2020.bundle.js`（全局 `AjvBundle`）编译 `instruction-packet.schema.json`，复用 `SchemaValidator.toDiagnostics` 翻译错误。
- 该 Schema 无 `$ref` 依赖，可单独编译；缺失 `$id` / 编译失败 → 明确拒绝，绝不静默跳过。

## 10. Instruction Compiler

- `InstructionCompiler.compile({ protocol, meeting, phaseId, participantId, roleRegistry })` → `{ ok, packet? , diagnostics? }`。
- 解析 actor 目标参与者时**复用** `MeetingRuntime._resolveParticipants`（只读，不调用任何推进逻辑），保证与 Runtime 的 actor 语义完全一致、不重复实现。
- Role Card 解析经 `RoleCardRegistry.byRoleClass(participant.role_class)`；协议要求包含却缺卡 → `ROLE_CARD_NOT_FOUND` 明确拒绝。
- `human_arbiter` / `system` 选择器（human_gate / archive 阶段）没有可供编译的 Agent 目标 → `COMPILER_NO_AGENT_TARGET`，留待 D2-R2/R3 处理人类/系统指令。
- 不接 LLM、不渲染 Prompt、不接 Transport、不修改 Protocol/Meeting/Runtime。

## 11. 确定性保证

- `packet_id` 由「内容」Canonical JSON（复用 `ProtocolFingerprint.canonicalize`）求 **FNV-1a 32-bit**（纯 JS，无 Crypto 依赖，浏览器/Node 同结果）得到 `ip-xxxxxxxx`，**内容寻址**：同输入 → 同 id；任务/参与者/上下文变化 → 不同 id（TEST-91/92/93）。
- `generated_at` 为时间元数据，**不计入** packet_id 哈希；可注入时钟 `setClock(fn)`（默认确定性常量 `0001-01-01T00:00:00+00:00`），保证测试可复现（TEST-109）。
- 产物 100% JSON-safe：无 `Map`/`Set`/`Function`/`Promise`/DOM（TEST-108）。

## 12. 诊断码（本轮新增 7 个）

```
COMPILER_PROTOCOL_INVALID      COMPILER_PHASE_NOT_FOUND
COMPILER_PARTICIPANT_NOT_FOUND COMPILER_PARTICIPANT_NOT_TARGETED
COMPILER_NO_AGENT_TARGET       ROLE_CARD_NOT_FOUND
ROLE_CARD_INVALID
```

沿用既有 `ProtocolDiagnostic` 结构（`code/severity/filePath/protocolId/protocolVersion/jsonPath/message/details`），未另起体系。

## 13. 自动测试

```
node app/tests/run-node.js
总计 109 · 通过 109 · 失败 0
```

| 区段 | 覆盖 |
| --- | --- |
| TEST-01..84 | D1-R1..R4 全部（无回归） |
| TEST-85..88 | RoleCardRegistry：按 role_class 解析 / 多卡确定性 pick / 非法卡拒绝 / hasRoleClass |
| TEST-89 | 示例 Role Card 通过 `role.schema.json`（Ajv） |
| TEST-90..93 | Compiler 确定性 / packet_id 稳定 / 任务变化→id 变 / 参与者变化→id 变 |
| TEST-94..96 | include_role_card：true→解析卡 / 缺卡→拒绝 / false→null |
| TEST-97..98 | include_visibility_rules：true→visibility 非 null / false→null |
| TEST-99..101 | context_scope 透传 / output_contract 透传 / actor.selector 透传 |
| TEST-102..106 | 拒绝路径：phase 不存在 / participant 不存在 / 不在目标集 / human_gate·system / battle selected_participants |
| TEST-107 | 产物通过 `instruction-packet.schema.json`（含 structured_json 与 text 两种输出合同） |
| TEST-108 | 产物 JSON-safe（无 Map/Set/Function，往返等价） |
| TEST-109 | setClock 覆盖与重置 |

## 14. 首轮结果

**直通车：109/109 PASS，无失败、无越界、无 Schema 回归。** 因 D2-R1 在 D1-R4 既有的「Schema 校验 / 静态审计 / 确定性测试」骨架上增量实现，且 Compiler 纯函数边界清晰，首轮即全绿。

## 15. 是否修改正式 Schema

**冻结 6 份 Schema（`protocol/role/message/artifact/annotation/meeting`）零修改。** 仅新增独立文件 `instruction-packet.schema.json`（编译产物校验用，非 6 份之一），并写入 `schema/manifest.sha256.json`。

## 16. 范围越界扫描

对 `app/js/instruction-compiler.js`、`role-card-registry.js`、`instruction-packet-schema.js` 扫描 `PromptCompiler|WEB_RELAY|webRelay|openai|anthropic|replay\s*engine|timeline\s*ui|branchengine|apiKey|fetch\(|XMLHttpRequest|WebSocket|setTimeout|setInterval` → **零命中**；静态审计（TEST-10）复用 D1-R4 守卫，亦通过。

## 17. 浏览器验收面板

本论**不新增 UI**：D2-R1 是 headless 确定性模块 + 测试，目标是「编译产物可被人肉检查」（§27 设计意图）。Prompt 渲染与可见的编译面板留 D2-R2。

## 18. 已知问题（设计内）

1. **Compiler 尚未接入 Runtime / UI**：Runtime 仍只产出 `pendingAction`；Compiler 是独立产出，调用方（未来 harness / D2-R2 面板）负责把 `pendingAction` 的参与者喂给 Compiler。本论未改 Runtime。
2. **Role Card 仅为示例**：`roles/` 下仅有 advisor / chair_secretary 两张基础卡；多角色原型、AI 动态生成角色（Role-Card-Spec §2）留后续。
3. **human_gate / archive 阶段不编译**：其 actor 为 `human_arbiter` / `system`，无 Agent 目标 → `COMPILER_NO_AGENT_TARGET`；人类/系统指令渲染在 D2-R2/R3。

## 19. 是否实现 D2 后续内容

**否。** 无 Prompt 文本渲染、无 Transport、无真实模型调用。D2-R1 只交付「确定性编译 → 结构化数据包」这一环，使 D2-R2（Prompt 渲染）与 D2-R3（Transport）有可消费的产物。

## 20. Commit 前检查

- [x] `node app/tests/run-node.js` → 109/109 PASS
- [x] 冻结 6 份 Schema 无 diff
- [x] 范围越界扫描通过（无 Prompt/Replay/Transport/LLM）
- [x] `file-tree.md` / `changelog.md` 已同步
- [x] 无临时调试文件残留

## 21. Git 最终状态

> HEAD：`dc928c4ba0d6914984fb17d11ba359a3a7f859d7`（短 `dc928c4`）；Remote `main` 经 `git ls-remote` 校验等于本地 HEAD。

- Branch：`main`
- Commit message：`D2-R1: add instruction compiler and role card registry`
- Remote `main`（`git ls-remote origin main` 权威校验）应等于本地 HEAD，**已 push 成功**
- Ahead/Behind：0/0；Worktree：clean
- 提交规模：13 files changed（含本报告），`+1146 / -3` 以外另含本报告

## 22. 范围扫描（forbidden API）

见 §16：三份新模块零命中禁止 API；`run-node.js` 的 `AUDITED` 已纳入三份新模块，TEST-10 静态审计覆盖。

## 23. 浏览器面板

不适用（本论 headless）。D1-R4 持久化面板保持不变。

## 24. 已知问题（明细）

- `roles/` 目录目前仅被测试注入；浏览器端从 `roles/` 自动加载 Role Card 的 loader 留待接入 harness（不属 D2-R1 范围）。
- `committee-mvp` 协议本身未含 `roles` 字段，故 D1-R4 §24-1 的 Role Registry 缺口由本论的 `RoleCardRegistry` + 示例卡补齐，但协议文件未改动（避免污染冻结示例）。

## 25. 人工真机清单（编译产物可人肉检查）

本论为确定性模块，核心「可人肉检查」目标已由自动化覆盖；建议一次人工抽检：

| # | 步骤 | 期望 |
| --- | --- | --- |
| A01 | 浏览器控制台/Node 加载 `app/js/instruction-compiler.js` | 无 CDN / 无网络请求 / 无定时器 |
| A02 | 对 `opening` 阶段 `agent-a1` 调用 `InstructionCompiler.compile` | 返回 `ok:true`，`role_card.role_class==="advisor"`，`visibility.mode==="semi_anonymous"` |
| A03 | 检查 `packet_id` | 形如 `ip-xxxxxxxx`，同一输入多次一致 |
| A04 | 将协议 `opening.task` 改一字 | `packet_id` 改变，证明内容寻址 |
| A05 | 检查产物可被 `InstructionPacketSchemaValidator` 校验通过 | `ok:true` |

## 26. D2 阶段验收（R1）

D2-R1 关闭：指令编译器核心已落地——协议驱动、100% 确定性、可快照、可测试、可被人肉检查的结构化 `InstructionPacket`；Role Registry 缺口补齐；Schema 校验闭环成形。

**D2-R1 状态：CLOSED。**

## 27. 下一步建议

按 D1-R4 报告 §27 的拆分，D2 下一轮为 **D2-R2 Prompt 渲染**：`InstructionPacket → 人类可读 Prompt 文本`，与编译器解耦。建议范围：

1. `PromptRenderer`：`(InstructionPacket) → string`（或结构化段落），严格只消费 Packet 字段，不回查协议/会议。
2. 可见性规则落实：按 `visibility.mode` 决定角色/阵营/模型代号的显隐（Role-Card-Spec §5）。
3. 输出合同渲染：`structured_json` 给出字段骨架，`text` 给出必填小节。
4. 渲染结果同样需确定性 + 可测试（同 Packet → 同 Prompt）。
5. Transport 抽象（含 WEB_RELAY）再往后放（D2-R3）。
