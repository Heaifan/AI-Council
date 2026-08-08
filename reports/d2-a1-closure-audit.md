# D2-A1 Integration Closure Audit — AI 顾问委员会 v0.1

> 日期：2026-08-08
> 阶段：D2-F1（Developer Harness Integration）完成后的 closure 审计
> 目标：确认 D2 是否具备正式 **CLOSED** 条件。
> 本轮约束（硬性）：禁止新增产品功能 / 禁止进入 D3 / 禁止 Transport / 禁止六席会议室 UI。

---

## 0. 执行 TODO 与状态

| # | 任务 | 状态 |
|---|------|------|
| 1 | Git 基线 | ✅ |
| 2 | 新鲜测试（Node + Browser） | ✅ |
| 3 | Browser Script 装配审计 | ✅ |
| 4 | >100 行文件职责审计 | ✅ |
| 5 | D2 架构边界审计 | ✅ |
| 6 | D3 前置契约检查 | ✅ |
| 7 | D2-A1 审计报告 | ✅（本报告） |
| 8 | 必要最小修复 | ✅（修正 d2-f1-report.md 误导计数，见 §10） |
| 9 | 完成门禁 + commit/push | ✅ |

---

## 1. Git 基线（Task 1）

| 项 | 值 |
|----|----|
| 当前分支 | `main` |
| HEAD | `3de821068fc305fc227a72ec4b412069b2fb53d2` |
| origin 远端 | `git@github.com:Heaifan/AI-Council.git` (fetch/push) |
| ahead / behind | `0 / 0`（与 origin/main 完全对齐） |
| worktree | clean（无未提交改动） |
| staged | 无 |
| untracked | 无 |
| stash | 无（未触碰任何既有 stash） |

**结论**：工作区处于干净、已推送状态，审计起点可靠。

---

## 2. Node 测试（Task 2 · 新鲜执行，非缓存）

命令：`node app/tests/run-node.js`

```
总计 144 · 通过 144 · 失败 0
```

- 原 D1 基线 **128** 项：零回归。
- D2-F1 新增 **TEST-129..144**（16 项）：脚本装配、Snapshot 冻结、无 Meeting 禁用、Create Demo 不预跑、Mock 单步、Human Gate 拦截、Battle 确定性、编译端到端、切换重编译、**Role ≠ Participant**、Save-Load 往返。
- 静态审计（`FORBIDDEN_APIS`）：`app/js/**`、`app/index.html` 对 `fetch / WebSocket / setTimeout / Clipboard / open / XMLHttpRequest` 等**零命中**（local-first 不受破坏）。

**结论**：144/144 PASS，确认鲜果。

---

## 3. Browser 测试（Task 2 · 新鲜执行）

命令：`node app/tests/run-browser.js`（chrome 真机，file://，无服务器）

```
=== chrome ===
... 29 个 PASS ...
总计 29 · 通过 29 · 失败 0
```

### 3.1 测试数量解释（明确回答「29 到底是什么」）

`run-browser.js` 是一个**驱动器脚本**，它对真实 Chrome 发出 `check()` 外层断言。29 是**外层驱动断言数**，分解为：

| 外层段 | 函数 | 外层断言数 |
|--------|------|-----------|
| D1-R1 Protocols Tab | `runD1` | **9** |
| D2-F1 Meeting + Compiler 真实点击 | `runD2F1` | **19** |
| 自动测试页验证 | `runTestPage` | **1** |
| **合计** | | **9 + 19 + 1 = 29** |

**关键澄清**：

- `runTestPage` 这一个外层断言（`"D1 测试页：通过数 ≥ 15 且失败 0"`）会**打开 `test-runner.html`**，而该页内部运行 **15 条内层用例**（TEST-01..15）。
- 这 **15/15 是嵌套在 1 个外层断言之内的内层结果**，**不是** 29 之外的独立加数。
- 因此正确等式是 **29 = 9 + 19 + 1**，其中「+1」即「验证 15/15 测试页通过」的那一条外层断言。**绝不等于 9 + 19 + 15 = 29**（那种写法把 15 既当地内层结果、又当外层加数，属重复计数，已在上轮报告中误用，本轮已修正，见 §10）。

可把层级读作：

```
run-browser.js  (29 外层 PASS)
├─ runD1           9 外层
├─ runD2F1        19 外层
└─ runTestPage     1 外层  ── 内部加载 ──► test-runner.html（15 内层 PASS，含于该 1 外层）
```

---

## 4. Browser Script 装配审计（Task 3）

### 4.1 `app/index.html`（D2-F1 主应用）

装载顺序（关键片段）：

```
vendor/ajv2020.bundle.js
protocol-diagnostic → protocol-file-source → protocol-loader
  → protocol-schema-validator → protocol-semantic-validator   ← 在 registry 之前
  → protocol-registry → protocol-session
meeting-*（state/action/factory/runtime/event-log/checkpoint/fingerprint/archive/schema-validator/restore-validator/persistence/restore）
role-card-registry → instruction-packet-schema → instruction-compiler → prompt-renderer → mock-agent-runtime
harness/*（5 个无 DOM 流程层）
ui/dom → ui/diagnostic-view → ui/registry-view
ui/harness/*（5 个视图层）
app.js（最后）
```

核查项：

1. **无漏加载核心依赖**：`protocol-semantic-validator.js` 已装载（D2-F1 修复项），且在 `protocol-registry.js` 之前 —— `registry.classify` 在语义校验器存在时才跑语义校验，顺序正确。
2. **无加载顺序依赖错误**：依赖图满足（semantic 在 registry 前；meeting 模块在 runtime 前；harness/* 在 app.js 前）。
3. **无删除文件残留引用**：`meeting-persistence-ui.js`（D1-R4 旧面板）已于 D2-F1 删除，index.html 无引用。
4. **无重复加载**：每个脚本唯一装载一次。
5. **无「只在 Node 存在、浏览器缺失」的核心模块**：`harness/*` 是无 DOM 流程层，index.html 与 run-node.js 均装载；`ui/harness/*` 为 DOM 视图，仅在浏览器装载、Node 中仅作静态审计文本。仅 `protocol-test-cases-*.js` 等**测试文件**不进浏览器——这是预期（它们是测试套件本身，非运行时核心）。

### 4.2 `app/tests/test-runner.html`（D1 自动测试页）

装载：`vendor/ajv2020.bundle.js` → `protocol-diagnostic → protocol-file-source → protocol-loader → protocol-schema-validator → **protocol-semantic-validator** → protocol-registry → protocol-session` → `ui/dom` → `protocol-test-suite/fixtures/cases/cases-session/source-bundle/test-runner`。

- 该页是 D1-R1 **协议发现/注册**测试页，只需协议相关模块，**不需** meeting/harness 模块——装载范围正确。
- `protocol-semantic-validator.js` 已装载（line 35），D1-R2 遗留漏装问题已彻底关闭。
- 无死引用、无重复加载。

**结论**：装配审计通过，无缺口。

---

## 5. >100 行文件职责审计（Task 4）

判定原则：单一职责清晰、仅略超 100 行者登记技术债不强拆；明显混合多职责者提拆分建议；改变行为的大规模重构本轮禁止。

| 文件 | 当前行数 | 职责数 | 是否多职责 | 是否建议拆分 | 是否阻塞 D3 | 理由 |
|------|---------|-------|-----------|-------------|------------|------|
| app/js/meeting-runtime.js | 274 | 1（确定性会议状态机：start/drive/submitResult/submitHumanDecision/转场/参与者解析） | 否（内聚的状态机，多函数为同一职责的实现细节） | 否（D3 可提取纯转场表，但非必须） | 否 | 单一 SRP：确定性推进会议。行数高因内联了完整相位图与转场表，拆分状态机会改变行为，本轮禁止。 |
| app/js/prompt-renderer.js | 249 | 1（InstructionPacket → 人类可读 Prompt 文本） | 否 | 否 | 否 | 分段渲染（头/角色卡投影/相位框定/指令/约束）均属「包→文本」单一职责。可拆 section builder，但非必须，不阻塞。 |
| app/js/protocol-semantic-validator.js | 240 | 1（schema 之外的语义校验：相位图一致性/转场引用/actor 解析/completion 目标存在） | 否（多条规则，同一类职责） | 否 | 否 | 单 SRP：语义校验。规则多但不跨职责，不阻塞 D3。 |
| app/js/instruction-compiler.js | 188 | 1（(Protocol,Meeting,Phase,Participant)→InstructionPacket，含 Role Card 解析 + FNV-1a 寻址） | 否 | 否 | 否 | 单 SRP：编译。略超 100，登记技术债，不阻塞。 |
| app/js/meeting-restore-validator.js | 155 | 1（存档恢复前对 meeting.schema + 运行时不变量校验） | 否 | 否 | 否 | 单 SRP：恢复校验。不阻塞。 |
| app/js/protocol-registry.js | 133 | 1（add/classify/lookup，分流 available/invalid） | 否 | 否 | 否 | 单 SRP：注册与分类。不阻塞。 |
| app/js/protocol-diagnostic.js | 117 | 1（错误码目录 / 诊断消息） | 否 | 否 | 否 | 单 SRP：诊断消息目录。不阻塞。 |

**审计结论**：7 个文件均为「单一职责、仅篇幅偏长」，无架构级多职责混杂。全部登记为**技术债（非阻塞）**，本轮不机械拆文件。

---

## 6. Role / Participant / Model 边界（Task 5）

| 概念 | 角色定义 | 是否代表运行实例 | 证据 |
|------|---------|----------------|------|
| **Role Card** (`roles/*.json`) | 角色身份 / 职责 / 立场 / Prompt 与约束 | **否**——只是「身份模板」 | 4 张卡（advisor-base / chair-secretary-base / strategic-advocate / risk-challenger）均为静态数据，无任何运行态字段。 |
| **Participant** (`meeting.participants[]`) | 某场 Meeting 中的实际与会者 | **是**——绑定到具体一场会议 | `ParticipantBinding.options(meeting,…)` 严格从 `meeting.participants[]` 派生下拉；`instruction-compiler.js:59` 先取 `meeting.participants`，再 `resolveForParticipant(participant)` 取角色卡。 |
| **Agent Runtime / Model** | 未来真正执行模型调用 | 当前仅为测试桩 | `MockAgentRuntime` 仅被 `harness/meeting-step-flow.js` 与自身引用（grep 确认），**不进入真实 Runtime 路径**；`meeting-runtime.js` 零 model/llm/http 引用。 |

**边界验证（Role ≠ Participant ≠ Model 三不混）**：

- Compiler 的可选对象**只来自 `meeting.participants[]`**（TEST-143 守约：4 张 Role Card 中仅 3 个与会者进下拉）。
- Compiler 解析 Role Card 走 `registry.resolveForParticipant(participant)`（role_id 优先、role_class 回退），**绝不把 `roles/*.json` 当 Agent**。
- Meeting Runtime 不知道任何模型供应商；它只产出确定性 `pendingAction`，由 harness 用 Mock 消费。

---

## 7. Protocol / Runtime 边界（Task 5 续）

- **Protocol**（`protocols/committee-mvp/protocol.json`）：仅定义会议规则（相位图、actor、completion、转场、可见性）。grep 确认**零** `model/api/provider/transport/endpoint/llm` 字段。Protocol 不持有任何模型实现。
- **Meeting Runtime**：确定性推进会议状态，仅操作 `pendingAction`（结构见下）。grep 确认**零** `fetch/WebSocket/XMLHttpRequest/setTimeout/http` 等。Runtime 不直接绑定某家模型 API。
- **Action 形状**（`meeting-action.js`）：`collect_responses { action_type, phaseId, requiredParticipantIds, receivedParticipantIds }` 与 `await_human_decision { action_type, phaseId, choices }`——纯结构，无任何供应商耦合。

---

## 8. D3 前置契约检查（Task 6）

目标拓扑（D3 范畴，本轮**不实现**）：

```
Meeting Runtime（确定性）
      │  产出 pendingAction（collect_responses / await_human_decision）
      ▼
Agent Invocation Request  ← D3 新增「翻译层」，由 pendingAction 派生
      │
      ▼
Transport Interface（Web / API / Local）
```

**兼容性核查**：

1. **D2 是否需改核心数据模型？** 否。Runtime 已暴露 D3 所需全部输入：
   - `meeting`（含 `participants[]`、role 引用）
   - `pendingAction.requiredParticipantIds`（→ 调谁）
   - 经 `InstructionCompiler` 已编译的 `InstructionPacket`（→ 给他什么指令）
   - 经 `RoleCardRegistry` 解析的 Role Card（→ 角色约束）
2. **Runtime 是否感知供应商？** 否（见 §7）。D3 的 Transport 是**全新模块**，消费 Runtime 的输出，不反向侵入 Runtime。
3. **Protocol 是否需要加 model 字段？** 否（见 §7，Protocol 纯规则）。
4. **pendingAction 是否足以派生 AgentInvocationRequest？** 是：`{ participant_id, role_card_ref, instruction_packet_ref, protocol_id, meeting_id, phase_id }` 全部可由现有字段构造，无需改 Runtime。

**结论**：D2 数据模型与 D3 Transport 契约**向前兼容**，D3 可零侵入地叠加翻译层。无阻塞。

---

## 9. Blocking Issues

**0 个**。

- 自动测试：Node 144/144、Browser 29/29，全绿。
- 装配：无漏装/顺序错/死引用/重复。
- 边界：Role/Participant/Model、Protocol/Runtime 均清晰隔离。
- D3 前置：核心数据模型无需改动，兼容。

---

## 10. Technical Debt（非阻塞，登记）

1. **7 个 D1 超 100 行文件**（见 §5）：`meeting-runtime.js`(274) / `prompt-renderer.js`(249) / `protocol-semantic-validator.js`(240) / `instruction-compiler.js`(188) / `meeting-restore-validator.js`(155) / `protocol-registry.js`(133) / `protocol-diagnostic.js`(117)。单职责清晰，建议 D3 前统一收口到 ≤100 行，但**不阻塞 D2 CLOSED**。
2. **Battle 人工选人 UI 未做**：未选人时走确定性默认（全部 advisor 升序），界面如实告知具体 Battle 参与者（TEST-139）。正式「勾选 Battle 参与者」属 D3+ 产品 UI，不在 D2 范围——已在上轮报告明确登记。
3. **文档计数误导（已修）**：`d2-f1-report.md` 第 85 行原表述 `29/29（D1 Protocols 9 项 + D2-F1 19 项 + D1 测试页 15/15）` 易被误读为 `9+19+15=29`。本轮已改为明确「29 = 9 + 19 + 1，15/15 为嵌套内层结果」。属文档清晰度修正，非功能缺陷。

---

## 11. 是否建议 D2 CLOSED

**建议：D2 CLOSED。**

依据：
- 三个拍板点（只接线、Role≠Participant、Mock 单步）在上轮已实现并经本轮双绿验证。
- 本轮 closure 审计九项全过，Blocking Issues = 0。
- 唯一的 debt 均为非阻塞技术债，且有明确后续归属（D3 前收口 / D3+ UI）。
- 工作区干净、已推送、可审计。

> 按裁定，D2 CLOSED 后**不自动进入 D3**；D3（Transport Contract）需另行拍板启动。

---

## 12. 完成门禁（Task 9）

- 受影响测试已新鲜重跑：Node **144/144**、Browser **29/29**，与 §2/§3 一致。
- 仅做 1 处文档修正（§10.3），未触碰任何源代码行为。
- 本报告 `reports/d2-a1-closure-audit.md` 随修复一并提交。

**D2-A1: PASS**
**Recommendation: D2 CLOSED**
