# D2-R2 Prompt Renderer 开发报告

> 日期：2026-08-07
> 技术栈：HTML / CSS / JavaScript（Browser-first，无服务器、无后端、无 CDN；Node.js 仅用于自动测试）
> 基线：D2-R1 `b47cae4`（109/109 PASS，D2-R1 CLOSED）
> 承接：D2-R1 报告 §27「下一步：D2-R2 Prompt 渲染（InstructionPacket → 人类可读 Prompt 文本）」

---

## 1. 当前阶段

| 项 | 值 |
| --- | --- |
| 轮次 | **D2-R2**（D2 Prompt 渲染首轮） |
| 主题 | PromptRenderer：InstructionPacket → 人类可读 Prompt 文本（确定性、可见性红化、可测试） |
| 状态 | **COMPLETE** |
| 自动测试 | **128 / 128 PASS**（109 旧 + 19 新，TEST-110..128） |
| 正式 Schema | 冻结 6 份**零修改**；`instruction-packet.schema.json` 亦**零修改**（仅消费，不新增） |

本轮验收标准：给定经 `InstructionCompiler` 产出的 `InstructionPacket`，能**确定性**地渲染出一份人类可读、可快照、可测试、可被人肉检查的 Prompt 文本；可见性规则严格按 Role-Card-Spec §5 / Council-Constitution §4 落实；不接 LLM、不接 Transport。Transport（D2-R3）**不做**。

## 2. TODO 执行情况

D2-R2 拆分为 6 个工程任务（对应任务看板 #100..#105），全部关闭：

- #100 冻结 D2-R2 范围 + 新增诊断码 `RENDERER_PACKET_INVALID`
- #101 实现 `prompt-renderer.js`：`PromptRenderer.render(packet) → { ok, text?, diagnostics? }`
- #102 编写 TEST-110..128 渲染用例 + `run-node.js` 接线（RUNTIME / AUDITED 增加模块与测试）
- #103 跑测试（128/128）+ 禁止 API 范围越界扫描
- #104 文档同步（`file-tree.md` / `changelog.md` / 本报告）
- #105 提交 + 非 force 推送 + 远程树一致性校验

## 3. Git 基线

- 起始 HEAD：`b47cae4`（D2-R1 push 成功点，已与远程一致）
- 起始 worktree：clean
- 分支：`main`

## 4. 实际修改文件（`git diff --numstat` 口径，不含本报告）

```
app/js/prompt-renderer.js                  +249  -0
app/js/protocol-diagnostic.js              +4    -1
app/tests/protocol-test-cases-renderer.js  +265  -0
app/tests/run-node.js                      +4    -1
changelog.md                               +10   -0
file-tree.md                               +3    -1
```

合计：**6 files changed（不含本报告）, +535 / -3**。

## 5. 本轮范围（只做这些）

`PromptRenderer` 模块、1 个诊断码、19 项新增测试、文档同步。渲染**严格只消费 Packet 字段**，不回查协议/会议/角色文件。

## 6. 明确未做（禁止项，逐条确认）

| 禁止项 | 是否出现 |
| --- | --- |
| 真实 LLM 调用 / 文本生成 | 否（仅确定性模板渲染，无模型） |
| Transport / WEB_RELAY / API / LOCAL / Web Automation | 否（留 D2-R3） |
| 修改 Compiler / Runtime / 回查协议文件 | 否（Packet 即唯一事实来源） |
| 修改冻结 6 份正式 Schema 或 `instruction-packet.schema.json` | 否（仅消费 Packet） |
| 新增 UI 面板 | 否（headless 确定性模块 + 测试；可见渲染面板留 D2-R3 接入 harness） |

## 7. PromptRenderer 设计

`PromptRenderer.render(packet)` → `{ ok, text?, diagnostics? }`。纯函数、100% 确定、JSON-safe（输出为 `string`）。

段落结构（任一为 `null` 时跳过，用 `filter` 保证不出现空段）：

```
# AI 顾问委员会 · 指令提示（Instruction Prompt）
## 协议 / 会议 / 阶段
## 你的身份（对外标识）        ← 可见性红化仅作用于此段
## 你的角色职责（始终可见）     ← Agent 必知（Role-Card-Spec §4）
## 本阶段任务
## 上下文范围
## 可见性规则                  ← 仅当 include_visibility_rules=true
## 输出合同
## 选中原因
---
packet_id / compiler / renderer / deterministic / generated_at
```

关键设计点：

- **角色职责段始终完整渲染**：无论可见性模式如何，Agent 自身必须知道自己的角色卡、阵营、任务（Role-Card-Spec §4 / Constitution §4："Agent 自身仍必须知道自己的真实角色卡和阵营任务"）。因此 `role_card` 段不受可见性模式影响。
- **可见性红化仅作用于「对外标识」段**：该段描述"其他参会者能看到你什么"，由 `packet.meeting.visibility_mode` 驱动。
- **`include_visibility_rules` 仅控制是否渲染「可见性规则」解释段**（向 Agent 重申披露义务），不改变红化逻辑。
- **底层模型天然隐藏**：Packet 本身不含任何模型身份字段，因此三种模式下"模型隐藏"自动满足，渲染器绝不会泄露模型身份。

## 8. 可见性红化策略（Role-Card-Spec §5 / Constitution §4）

权威模式 = `packet.meeting.visibility_mode`（Packet 必含；为 `null` 时按 `public` 兜底）。「对外标识」段规则：

| 模式 | 个人 alias / participant_id | 阵营 | 角色 | 模型 |
| --- | --- | --- | --- | --- |
| `public` | 暴露 | 公开 | 公开 | 公开（Packet 无此字段） |
| `semi_anonymous` | 隐藏 | 公开 | 公开 | 隐藏（Packet 无此字段） |
| `full_anonymous` | 隐藏 | 仅阵营字母 A/B | 隐藏 | 隐藏（Packet 无此字段） |

`full_anonymous` 的对外代号 `A{n}`（如 `A1`）：由 `participant_id` 经 **FNV-1a 32-bit**（纯 JS，与编译器同源算法）派生 `n = (hash % 9) + 1`，确定性稳定且**不泄露真实 ID**。阵营字母取 `side_id` 首字符大写。

## 9. 输出合同渲染

- `mode = "text"`：列出 `required_sections`（若有）；无则给通用建议（判断/理由/风险/假设）。
- `mode = "structured_json"`：渲染 `json_schema` 为 2 空格缩进的 JSON 骨架（确定性，因 JS 对象键插入序稳定）；无 `json_schema` 时给通用骨架 `{"content","confidence"}`。

## 10. 畸形 Packet 守卫

`render()` 入口做轻量结构守卫（不依赖 Schema 校验器，保持模块解耦）：

- `packet` 非对象 / 数组 → `RENDERER_PACKET_INVALID`；
- 缺必填顶层字段（如 `protocol`/`meeting`/`phase`/`target`/`instruction`/`output_contract`/`actor` 等）→ `RENDERER_PACKET_INVALID`；
- 上述字段非对象（为 `null`）→ `RENDERER_PACKET_INVALID`；
- `meeting.visibility_mode` 为未知字符串 → `RENDERER_PACKET_INVALID`（保护红化契约不被非法模式绕过）。

`role_card` / `visibility` 允许为 `null`（协议显式关闭时），不触发拒绝。

## 11. 确定性保证

- 纯函数：同 Packet → 同 Prompt（TEST-111）。
- 无时钟、无随机、无 `Map`/`Set`/`Function`/DOM；输出为 `string`（TEST-110/111）。
- `full_anonymous` 代号由确定性 FNV-1a 派生，跨运行稳定。

## 12. 诊断码（本轮新增 1 个）

```
RENDERER_PACKET_INVALID
```

沿用既有 `ProtocolDiagnostic` 结构（`code/severity/filePath/...`），未另起体系。`protocol-diagnostic.js` 在 D2 段末追加。

## 13. 自动测试

```
node app/tests/run-node.js
总计 128 · 通过 128 · 失败 0
```

| 区段 | 覆盖 |
| --- | --- |
| TEST-01..109 | D1-R1..R4 + D2-R1 全部（无回归） |
| TEST-110 | 合法 packet → ok，非空 string |
| TEST-111 | 同 packet 两次渲染 → 文本完全一致 |
| TEST-112 | public：暴露 alias / participant_id / 角色 |
| TEST-113 | semi_anonymous：隐藏 alias/ID，保留角色与阵营，声明模型隐藏 |
| TEST-114 | full_anonymous：仅阵营字母+代号，角色与ID隐藏，但角色职责仍对 Agent 可见 |
| TEST-115 | include_role_card=false（role_card=null）→ 不渲染角色段 |
| TEST-116 | include_role_card=true → 渲染角色职责（名称/职责/约束/指引） |
| TEST-117 | include_visibility_rules=false → 不渲染可见性规则段 |
| TEST-118 | include_visibility_rules=true → 渲染可见性规则段（模式/披露矩阵） |
| TEST-119 | 输出合同 text 模式 → 列出必填小节 |
| TEST-120 | 输出合同 structured_json → 渲染 JSON 骨架 |
| TEST-121 | 上下文范围 none / selective 键枚举 |
| TEST-122 | 畸形 packet（null）→ RENDERER_PACKET_INVALID |
| TEST-123 | 畸形 packet（缺字段）→ RENDERER_PACKET_INVALID |
| TEST-124 | 未知可见性模式 → RENDERER_PACKET_INVALID |
| TEST-125 | actor.selector / selection_key / participant_ids 透传 |
| TEST-126 | footer：packet_id / renderer 版本 / deterministic / generated_at |
| TEST-127 | meeting.visibility_mode=null → 按 public 兜底 |
| TEST-128 | 端到端：InstructionCompiler 产物 → PromptRenderer 成功渲染 |

## 14. 首轮结果

**直通车：128/128 PASS，无失败、无越界、无 Schema 回归。** 因在 D2-R1 既有「Schema 校验 / 静态审计 / 确定性测试」骨架上增量实现，且 Renderer 纯函数边界清晰，首轮即全绿。

## 15. 是否修改正式 Schema

**冻结 6 份 Schema（`protocol/role/message/artifact/annotation/meeting`）零修改。** `instruction-packet.schema.json` 亦零修改——本轮仅**消费** Packet，不新增/不改动任何 Schema。`schema/manifest.sha256.json` 无需变动。

## 16. 范围越界扫描

对 `app/js/prompt-renderer.js` 扫描 `openai|anthropic|WEB_RELAY|webRelay|apiKey|fetch\(|XMLHttpRequest|WebSocket|setTimeout|setInterval|PromptCompiler|replay\s*engine|timeline\s*ui|branchengine` → **零命中**；`run-node.js` 的 `AUDITED` 已纳入 `prompt-renderer.js`，静态审计覆盖。

## 17. 浏览器验收面板

本论**不新增 UI**：D2-R2 是 headless 确定性模块 + 测试，目标为"渲染产物可被人肉检查"（§25 抽检 + 下方样例）。可见的"编译→渲染"面板留待 D2-R3 接入 harness（与 Transport 一并）。

## 18. 渲染样例（committee-mvp / opening / agent-a1 / semi_anonymous）

```text
# AI 顾问委员会 · 指令提示（Instruction Prompt）

## 协议 / 会议 / 阶段
- 协议：committee-mvp @ 0.1.0
- 会议：rt-c
- 阶段：独立陈述（agent_turn，phase_id=opening）

## 你的身份（对外标识）
对外标识：阵营 A · 角色 顾问（基础）（advisor） · （个人代号/ID 不公开，底层模型身份隐藏）

## 你的角色职责（始终可见）
- 名称：顾问（基础）（advisor，role_id=advisor-base）
- 描述：对议题给出独立判断、关键理由、风险与待验证假设。
- 职责：
  - 独立陈述初始判断
  - 给出关键理由
  - 列出主要风险
  - 提出待验证假设
- 关注维度：论据强度、风险敞口、不确定性来源
- 行为约束：
  - 不得泄露其他参会者被可见性模式禁止获得的隐私
  - 不得越权代替人类做最终裁定
- 任务指引：
  - 先给结论再给理由
  - 明确区分事实与推测

## 本阶段任务
独立陈述你的初始判断、关键理由、风险与待验证假设。

## 上下文范围
- 范围：meeting
- 共享键：（无指定键）

## 可见性规则
- 模式：半匿名（semi_anonymous）
- 披露：阵营：公开；角色：公开；底层模型：隐藏
- 允许模式：public、semi_anonymous、full_anonymous
- 注意：不得泄露其他参会者被本模式禁止获得的隐私（见行为约束）。

## 输出合同
- 模式：structured_json
- JSON 骨架：
  {
    "type": "object",
    "required": ["position", "reasons", "risks"],
    "properties": { "position": {"type":"string"}, "reasons": {"type":"array"}, "risks": {"type":"array"} },
    "additionalProperties": false
  }

## 选中原因
- actor.selector = all_advisors

---
packet_id: ip-e6036ea5 · compiler 0.1.0 · renderer 0.1.0 · deterministic · generated_at 0001-01-01T00:00:00+00:00
```

## 19. 已知问题（设计内）

1. **Renderer 尚未接入 Runtime / UI**：Runtime 仍只产出 `pendingAction`；Renderer 是独立产出，调用方（未来 harness / D2-R3 面板）负责把 `pendingAction` 的参与者喂给 Compiler → Renderer。本论未改 Runtime。
2. **human_gate / archive 阶段不渲染**：其 actor 为 `human_arbiter` / `system`，D2-R1 已 `COMPILER_NO_AGENT_TARGET` 拒绝编译，故无 Packet 可渲染；人类/系统指令渲染在 D2-R3。
3. **`full_anonymous` 代号为确定性派生而非会议内稳定序号**：同一 `participant_id` 跨会话稳定，但不保证与会议内其他参与者序号连续（如 A1/A2 的全局唯一性）。若需全局唯一 A1…An，需在 Packet 中携带会议内序号（D2-R3 或后续 Schema 扩展）。

## 20. 是否实现 D2 后续内容

**否。** 无 Transport / WEB_RELAY、无真实模型调用。D2-R2 只交付"确定性渲染 → 人类可读 Prompt"这一环，使 D2-R3（Transport 抽象）有可投递的文本产物。

## 21. Commit 前检查

- [x] `node app/tests/run-node.js` → 128/128 PASS
- [x] 冻结 6 份 Schema 无 diff；`instruction-packet.schema.json` 无 diff
- [x] 范围越界扫描通过（无 LLM/Replay/Transport/PromptCompiler）
- [x] `file-tree.md` / `changelog.md` 已同步
- [x] 无临时调试文件残留（样例脚本已删除）

## 22. 范围扫描（forbidden API）

见 §16：`prompt-renderer.js` 零命中禁止 API；`run-node.js` 的 `AUDITED` 已纳入新模块，静态审计覆盖。

## 23. 浏览器面板

不适用（本论 headless）。D1-R4 持久化面板保持不变。

## 24. 已知问题（明细）

- Renderer 与 Compiler 解耦：测试用最小合法 packet 字面量构造（不依赖 Compiler），端到端用例（TEST-128）再走 `InstructionCompiler.compile → PromptRenderer.render` 闭环验证。
- `RENDERER_PACKET_INVALID` 同时覆盖"结构缺失"与"未知可见性模式"两类防御，避免静默渲染非法/越权 Packet。

## 25. 人工真机清单（渲染产物可人肉检查）

本论为确定性模块，核心"可人肉检查"目标已由自动化覆盖；建议一次人工抽检：

| # | 步骤 | 期望 |
| --- | --- | --- |
| A01 | 浏览器控制台/Node 加载 `app/js/prompt-renderer.js` | 无 CDN / 无网络请求 / 无定时器 |
| A02 | 对 `opening` 阶段 `agent-a1` 先 `InstructionCompiler.compile` 再 `PromptRenderer.render` | 返回 `ok:true`，文本含角色职责与半匿名标识 |
| A03 | 改 `meeting.visibility_mode` 为 `full_anonymous` 重渲染 | 文本含 `代号 A`，不含 `participant_id=agent-a1` |
| A04 | 同 Packet 渲染两次 | 文本逐字节一致 |
| A05 | 传入 `null` 渲染 | `ok:false`，`RENDERER_PACKET_INVALID`，不抛异常 |

## 26. D2 阶段验收（R2）

D2-R2 关闭：Prompt 渲染核心已落地——Packet 驱动、100% 确定性、可见性红化严格对齐 Role-Card-Spec §5 / Constitution §4、可快照、可测试、可被人肉检查的人类可读 Prompt。

**D2-R2 状态：CLOSED。**

## 27. 下一步建议

按 D1-R4 / D2-R1 报告的拆分，D2 下一轮为 **D2-R3 Transport 抽象**：

1. `Transport` 抽象：`(RenderedPrompt, target) → 投递`，含 `WEB_RELAY` / `LOCAL` / `API` 等实现槽位（仅抽象，不接真实网络）。
2. 投递结果回写：Agent 响应 → `Message` / `Artifact`（经 `message.schema.json` / `artifact.schema.json`）。
3. 与 Runtime `pendingAction` 衔接：把"Compiler → Renderer → Transport"串成一条确定性投递链。
4. 可见的"编译→渲染→投递"浏览器面板可在此轮一并接入 harness。
5. 仍保持确定性 + 可测试 + 无真实 LLM 调用。
