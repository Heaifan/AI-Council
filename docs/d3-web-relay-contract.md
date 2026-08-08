# D3-D0 — WEB_RELAY Contract Freeze（合同冻结，D3 第一步）

> **状态更正（D3-D0-F1）**：原「D3-D0: PASS / Blocking Issues: 0」证据不足——Browser Gate 在开发沙箱**未执行**（Playwright 缺失，且安全策略拦截浏览器下载）。
> 正确状态：**Contract Implementation COMPLETE · Node/Contract Gate PASS · Browser Gate NOT VERIFIED · D3-D0 KEEP OPEN**。
> 不自动进入 D3-R1；待人工在具备 Playwright 的环境复跑浏览器门禁并确认后拍板。
> 适用范围：D3 的第一刀只冻结「服务于 **Manual WEB_RELAY** 的最小 Transport 合同」。
> 严禁在本轮预实现 API / LOCAL / WEB_AUTOMATION；核心合同严禁承载任何供应商或 UI 专有字段。

---

## 1. Purpose（目的）

把系统从「Mock 会议模拟器」推进为「真实 AI 会议系统」：证明这条闭环可确定性跑通——

```
Meeting Runtime（确定性状态机）
   → InstructionPacket（D2-R1 编译产物）
   → PromptRenderer（D2-R2 人类可读 Prompt）
   → 外部 Web AI（人把 Prompt 复制出去、把响应粘贴回来：Manual Relay）
   → Transport Result
   → Response Validation（D3-R1/R2）
   → Message（validation.status=pending/valid/invalid）
   → accepted_by_runtime → Runtime 状态继续推进
```

D3-D0 只冻结上述链路里**机器与机器之间、机器与人之间**的确定性合同，不实现 Manual Relay 的具体 UI（那是 D3-R1），也不实现自动校验/自动粘贴（那是 D3-R2/R3）。

---

## 2. Architecture Boundary（架构边界）

- **Agent ≠ Role ≠ Model ≠ Transport**：Protocol / Runtime 不依赖任何供应商 API；本合同的 `transport_kind` 是 `mock | api | local | web_relay | web_automation` 的枚举值之一，但 D3-D0 只实现 `mock` 与 `web_relay`。
- **合同纯数据**：四份合同（`AgentInvocationRequest` / `AgentInvocationResult` / `TransportAdapter` / `WebRelayStateMachine`）均为 JSON-safe 的浅冻结对象，可序列化、可存盘、可审计。
- **红线（被测试强制执行）**：`metadata` / `transport_metadata` 禁止任何供应商或 UI 专有字段——`openai_model / claude_url / chatgpt_tab_id / gemini_url / api_key / tab_id / dom_selector / button_state` 一律拒绝进入通用合同。
- **零侵入 D1/D2**：D3-D0 不修改 Meeting Runtime 核心数据模型（D2-A1 已确认可由 `pendingAction` 派生 Request）。本合同的代码全部落在 `app/js/invocation/`，仅向 `protocol-diagnostic.js` 追加错误码、向 `meeting.schema.json` 的 `event_type` 枚举追加 2 个新值（`invocation_created` / `invocation_cancelled`），并移除初版误加的 `invocation_waiting`（属可推导的内部状态迁移，不污染正式枚举）。

### 数据流（最小，Manual Relay）

```
[Meeting Runtime]  getNextAction() → collect_responses
       │  (D3-R1 从这里派生，D3-D0 不涉及 Runtime)
       ▼
[AgentInvocationRequest.create]  (meeting + phase + participant + packet + rendered_prompt)
       │  request_id = content-address(meeting+phase+participant+packet) + sequence
       ▼
[TransportAdapter]  ── mock: invoke() 直接返回 Result（离线/测试）
                    ── web_relay: begin() 进入 Manual Relay 状态机
       │  （人复制 rendered_prompt → 外部 Web AI → 粘贴 raw_response）
       ▼
[AgentInvocationResult]  (success/failure/cancelled/needs_human_refill + raw_response + error)
       │
       ▼
[Response Validation — D3-R1/R2]  Result → Message(validation.status) → accepted_by_runtime
       │
       ▼
[Meeting Runtime]  submitResult() → 状态推进
```

---

## 3. AgentInvocationRequest（Meeting → Transport 唯一合同）

文件：`app/js/invocation/agent-invocation-request.js` · `A.AgentInvocationRequest`

冻结字段（`FIELDS`，多一个少一个都算违约，`validate` 严格比对）：

| 字段 | 含义 |
|---|---|
| `schema_version` | 合同版本 `"0.1.0"` |
| `request_id` | `req-` + FNV-1a32(canonical{meeting,phase,participant,packet}) + `-` + 2 位 sequence |
| `meeting_id` | 来源会议 |
| `phase_id` | 当前相位 |
| `participant_id` | 目标委员 |
| `model_ref` | 来自 participant（可空；不进 Transport 实现细节） |
| `transport_kind` | 来自 participant（默认 `mock`） |
| `instruction_packet` | 编译产物深拷贝（唯一事实来源） |
| `rendered_prompt` | PromptRenderer 的确定性产物（**不是 UI 状态**） |
| `renderer_version` | `PromptRenderer.RENDERER_VERSION` |
| `created_at` | 可注入时钟（默认确定性常量） |
| `metadata` | 开放袋，但禁止供应商/UI 专有字段 |

**关键语义**：
- `request_id` 按「目标」内容寻址：`meeting+phase+participant+packet` 相同则 `request_id` 相同；`rendered_prompt` 变化不影响 `request_id`；`sequence` 不同则 `request_id` 不同（Retry 复用同一 `request_id`，重新发起才递增 sequence）。
- 校验失败码：`PARTICIPANT_NOT_FOUND`（委员不在 `meeting.participants[]`）、`TRANSPORT_KIND_UNSUPPORTED`（非法 `transport_kind`）、`INVOCATION_REQUEST_INVALID`（缺字段 / `metadata` 含违禁键 / 字段集不符）。

---

## 4. AgentInvocationResult（Transport → Meeting 唯一合同）

文件：`app/js/invocation/agent-invocation-result.js` · `A.AgentInvocationResult`

冻结字段（`FIELDS`）：

| 字段 | 含义 |
|---|---|
| `schema_version` | `"0.1.0"` |
| `result_id` | `res-` + FNV-1a32(canonical{request_id,status,received_at}) |
| `request_id` | 回指 `AgentInvocationRequest` |
| `status` | `success` / `failure` / `cancelled` / `needs_human_refill` |
| `raw_response` | 外部 AI 原样返回 |
| `normalized_content` | 经校验/归一后的候选内容（开放结构） |
| `transport_metadata` | 开放袋，禁止供应商/UI 专有字段 |
| `error` | `{code,message}`（failure/cancelled 必带） |
| `received_at` | 可注入时钟 |

**🔴 红线（最重要）**：`Result ≠ 正式 Meeting Message`。
- Result 内**严禁出现 `message_id`**——`message_id` 是 Runtime 在接受后才生成的；外部 AI 的返回绝不能直接成为会议事实。
- 必须通过：`Transport Result → Response Validation → Message(validation.status) → accepted_by_runtime → Runtime State Advance`。
- 一致性约束（被 `create` 强制）：`success` 必须带 `raw_response`（字符串）；`failure` / `cancelled` 必须带 `error`。

---

## 5. TransportAdapter（最小抽象接口）

文件：`app/js/invocation/agent-transport-adapter.js`（抽象接口 + `create` 工厂）· `app/js/invocation/agent-mock-transport.js`（`MockTransport`）· `app/js/invocation/agent-web-relay-transport.js`（`WebRelayTransport`）· 命名空间 `A.TransportAdapter`

冻结的接口形状（所有 Transport 必现）：

| 成员 | 形态 |
|---|---|
| `kind` | `"mock"` / `"web_relay"`（将来才扩展 api/local/web_automation） |
| `invoke(request)` | Mock 风格：`{ok, result}`（同步、确定性、无外部调用） |
| `begin(request)` | WebRelay 风格：`{ok, handle, state}` |
| `receive(handle, rawResponse)` | `{ok, state, result}` |
| `validate(handle)` | `{ok, state, result}`（空响应 → `rejected` + `EMPTY_RESPONSE`） |
| `accept(handle)` | `{ok, state, result}`（`validated → accepted`） |
| `reject(handle, code, message)` | `{ok, state, result?}`（`validated → rejected`） |
| `cancel(handle)` | `{ok, state, result?}`（`waiting_external → cancelled`，产出 cancelled Result） |
| `retry(handle)` | `{ok, state}`（`rejected`/`failed → waiting_external`，清空 result） |
| `getState(handle)` | 当前状态 或 `null` |

- **`MockTransport`**（已实现，确定性）：`invoke` 返回 `success` Result，供合同测试与离线演练。
- **`WebRelayTransport`**（已实现最小骨架，状态机驱动）：持有运行期 `store`（按 `request_id` 索引），所有状态合法性委托给冻结的 `WebRelayStateMachine`；不发起任何网络请求。
- **工厂 `TransportAdapter.create(kind)`**：仅放行 `mock` / `web_relay`；传入 `api` / `local` / `web_automation` 一律返回 `TRANSPORT_KIND_UNSUPPORTED`（D3-D0 边界）。
- `isTransportAdapter(x)`：结构判定工具。

---

## 6. WebRelay State Machine（Manual Relay 生命周期）

文件：`app/js/invocation/agent-web-relay-state-machine.js` · `A.WebRelayStateMachine`

最小状态集（8 个）：`created / waiting_external / response_received / validated / accepted / rejected / failed / cancelled`

冻结的合法转移表（`TRANSITIONS`，唯一真相）：

```
created ──BEGIN_EXTERNAL──▶ waiting_external
waiting_external ──RESPONSE_RECEIVED──▶ response_received
waiting_external ──CANCEL──▶ cancelled
waiting_external ──TRANSPORT_FAILED──▶ failed
response_received ──VALIDATE_OK──▶ validated
response_received ──VALIDATE_FAIL──▶ rejected        (例：空响应 → EMPTY_RESPONSE)
validated ──ACCEPT──▶ accepted
validated ──REJECT──▶ rejected
rejected ──RETRY──▶ waiting_external
failed   ──RETRY──▶ waiting_external
accepted / cancelled：终止态（不再有合法转移）
```

- `canTransition(from, event)` / `apply(from, event)`：`apply` 非法转移返回 `{ok:false, error:{code:INVOCATION_STATE_TRANSITION_INVALID}}`。
- `replay(history)`：自 `created` 起逐跳重放一段 `event` 序列，校验每一步合法，返回最终态或首个非法跳的索引——用于**断点续传 / 审计恢复**（Reload Recovery）。
- 关键红线：`accepted` 才是「可被 Runtime 接受为正式发言」的前置；`rejected` / `failed` / `cancelled` 都不是。

---

## 7. Validation Boundary（校验边界）

- D3-D0 冻结「Result 必须经过校验才能成为 Message」这条边界，**不实现**具体校验逻辑（那是 D3-R2）。
- `WebRelayTransport.validate()` 仅做最低限度守门：**空响应 → `rejected` + `EMPTY_RESPONSE`**；非空 → `validated`。更细的内容校验（格式/长度/必含字段/与 Packet 输出合同对齐）归 D3-R2。
- 路径钉死：

```
Result(status=success, raw_response)
   → [D3-R2 Response Validation]
   → Message{ validation.status = pending | valid | invalid | corrected, accepted_by_runtime = false }
   → [人工或 D3-R3 自动] accept → accepted_by_runtime = true
   → Runtime.submitResult() → 状态推进
```

---

## 8. Persistence（持久化映射）

- `AgentInvocationRequest` / `AgentInvocationResult` 均为 JSON-safe，可直接作为 `meeting.events[].payload` 或随存档快照落盘（D1-R4 单 JSON 存档机制复用，无需新结构）。
- Relay 生命周期以**事件**形式进入 `meeting.events[]`（见 §9 映射），因此断点续传时 `WebRelayStateMachine.replay()` 可重放事件序列恢复状态，与 D1-R4 Event Log 的 append-only 原则一致。
- `request_id` / `result_id` 内容寻址，保证跨会话可复现、不撞号。

---

## 9. Event Mapping（审计事件映射）

复用 `meeting.schema.json` 既有 `event_type` 枚举为主，仅补 2 个真正新的（已写入 schema，`manifest.sha256.json` 同步刷新）：

| WEB_RELAY 状态/动作 | Meeting 审计事件 | 说明 |
|---|---|---|
| `created`（begin） | **`invocation_created`** ✨新增 | 一次 Manual Relay 调用诞生（会议级事实，Replay/Audit 需要） |
| `response_received` | `agent_output_received`（既有） | 外部 AI 响应已收回 |
| `validated` | （Relay 内部里程碑，不另发会议事件） | 仅状态机内部 |
| `accepted` | `message_accepted`（既有） | Runtime 接受为正式发言 |
| `rejected`（校验失败） | `message_rejected`（既有，等同 user 所说 `agent_output_rejected`） | 候选消息被拒；优先复用既有枚举，不新增近义事件 |
| `failed`（传输失败） | `transport_error`（既有） | 传输层错误 |
| `cancelled` | **`invocation_cancelled`** ✨新增 | 用户取消本次调用（会议级事实，Replay 须反映「该委员未被听取」） |

✨ 新增 2 个枚举值：`invocation_created` / `invocation_cancelled`。其余全部复用既有事件，零近义冗余。
> **F1 审计移除 `invocation_waiting`**：它只是 `created → waiting_external` 这一必然发生的内部状态迁移，完全可由 `invocation_created` + 冻结转移表推导出，不携带独立会议级信息；保留它只为状态机对称性，违反「Meeting Event 记录不可推导的外部可观察事实」原则，故移除并同步 schema / manifest / docs。

---

## 10. Error Model（错误模型）

文件：`app/js/protocol-diagnostic.js`（`D.CODE` 追加）。分两组，语义刻意分开：

**A 组 · WEB_RELAY 业务错误（解释「这次调用为什么没能成为正式发言」）**

| 码 | 含义 |
|---|---|
| `EMPTY_RESPONSE` | 外部返回为空，需要人工回填或重试 |
| `INVALID_RESPONSE` | 响应格式/内容不合法 |
| `VALIDATION_FAILED` | 响应未通过 Response Validation |
| `CANCELLED` | 用户取消本次 Manual Relay |
| `TRANSPORT_FAILED` | 传输层失败 |
| `STALE_INVOCATION` | 引用了未知/已过期的 handle |
| `PARTICIPANT_NOT_FOUND` | 委员不在本会议 `participants[]` |

**B 组 · 合同完整性错误（调用方违反机器合同，与 A 组语义不同）**

| 码 | 含义 |
|---|---|
| `INVOCATION_REQUEST_INVALID` | Request/Result 构造违反冻结合同（缺字段 / 字段集不符 / `metadata` 含违禁键 / 一致性约束破坏） |
| `INVOCATION_STATE_TRANSITION_INVALID` | 状态机非法转移 |
| `TRANSPORT_KIND_UNSUPPORTED` | `transport_kind` 不在 D3-D0 放行范围（api/local/web_automation） |

---

## 11. Explicit Non-Goals（本轮明确不做）

- ❌ OpenAI / Anthropic / Gemini 等供应商 API 直连
- ❌ Local LLM / Ollama 等本地模型
- ❌ 浏览器自动化（Playwright 控制 ChatGPT / Selenium / Chrome Extension）
- ❌ `WEB_AUTOMATION` transport 任何实现
- ❌ 正式六席会议室 UI
- ❌ 多 Agent 并行调度（属 D4）
- ❌ 具体 Response Validation 实现（属 D3-R2）
- ❌ 真实会议闭环接线（属 D3-R1，且需人工拍板后进入）

D3-D0 是**纯合同冻结**：四份合同 + 错误码 + 2 个审计事件 + 12 条 Contract Test 全部就绪，等待人工在浏览器门禁验证后进入 D3-R1（Manual Relay 实现）。

---

## 12. Contract Tests（12 条，全部 PASS）

文件：`app/tests/protocol-test-cases-web-relay-contract.js`（D3D0-01 … D3D0-08，合同结构组）与 `app/tests/protocol-test-cases-web-relay-state.js`（D3D0-09 … D3D0-12，状态机/Transport 组），由 `app/tests/run-node.js` 统一执行。

| ID | 覆盖 |
|---|---|
| D3D0-01 | Request 成功路径 + `validate` 字段集严格一致 |
| D3D0-02 | Request 拒绝供应商/UI 字段（openai_model） |
| D3D0-03 | Request 缺 participant → `PARTICIPANT_NOT_FOUND` |
| D3D0-04 | Request 非法 transport_kind → `TRANSPORT_KIND_UNSUPPORTED` |
| D3D0-05 | request_id 内容寻址可复现；prompt 不影响；sequence 改变 |
| D3D0-06 | Result 成功且**不含 `message_id`**（≠ 正式 Message） |
| D3D0-07 | Result 一致性约束（success 必带 raw_response；failure/cancelled 必带 error） |
| D3D0-08 | Result 拒绝供应商/UI 字段（chatgpt_tab_id） |
| D3D0-09 | 状态机合法链路 created→…→accepted + 终止态 |
| D3D0-10 | 状态机非法转移拒绝 + `replay` 重放校验 |
| D3D0-11 | 工厂放行 mock/web_relay，禁止 api/local/web_automation；Mock invoke 回指 request |
| D3D0-12 | WebRelayTransport 端到端 Manual Relay 生命周期（空→rejected→retry→接受 / cancel） |

**门禁结果（D3-D0 初次提交，证据不足）**：`run-node.js` 自动测试 **156/156 PASS**（原 144 零回归，+12 合同测试）；`index.html` 脚本装配静态审计（TEST-129）通过；`invocation/*.js` 已纳入 RUNTIME 与 AUDITED。但 `run-browser.js`（Playwright 真机，29/29）**在开发沙箱未执行**——Playwright 缺失，且安全策略（safe-delete）拦截浏览器下载，无法补跑。彼时据此宣布「D3-D0: PASS」属**证据不足**，违反本委员会「未验证 ≠ PASS」原则。

> **原结论更正**：不能作为 PASS。正确状态见 §13。

---

## 13. D3-D0-F1 · Closure Gate Fix（状态更正与治理修复）

D3-D0 架构方向获认可（WEB_RELAY 优先、Transport 与 Protocol/Role 解耦、Result ≠ 正式 Message、Runtime 不绑供应商、Meeting Schema 不推倒重来），但 Closure Gate 不完整，故 D3-D0 **KEEP OPEN**，禁止进入 D3-R1。

### 13.1 行数审计与拆分（红线：单文件 ≤100 行）

| 文件 | 原行数 | 处理 | 现状态 |
|---|---|---|---|
| `agent-invocation-request.js` | 106 | 单一职责（构造/校验 Request），拆分反而降低内聚 | **≤110 明确例外**（写入本表与 changelog） |
| `agent-transport-adapter.js` | 167 | 含 3 职责：抽象 `TransportAdapter`/`create` 工厂 + `MockTransport` + `WebRelayTransport` | 拆为 `agent-transport-adapter.js`(抽象) + `agent-mock-transport.js` + `agent-web-relay-transport.js`，均 ≤100 |
| `protocol-test-cases-web-relay.js` | 169 | 12 条测试按责任可分两组 | 拆为 `…-contract.js`(D3D0-01..08) + `…-state.js`(D3D0-09..12)，均 ≤100，测试 ID 不变 |

> 拆分**不改变合同语义**：`A.TransportAdapter` 命名空间、工厂 `create(kind)`、Mock/WebRelay 行为、`A.TransportAdapter.MockTransport` / `.WebRelayTransport` 引用路径全部保持；`create` 改为运行期惰性引用具体类。Node 门禁 156/156 零回归。

### 13.2 Event Enum 必要性审计

| 枚举 | 判定 | 理由 |
|---|---|---|
| `invocation_created` | 保留 | 会议级事实：Runtime 派生并诞生一次外部调用；Replay 需知「问过谁、何时」，Audit 需证明其确被调用 |
| `invocation_cancelled` | 保留 | 会议级事实：用户主动取消挂起的 Manual Relay；Replay 须反映「该委员未被听取」，非可推导 |
| `invocation_waiting` | **移除** | 仅为 `created → waiting_external` 必然发生的内部状态迁移，可由 `invocation_created` + 冻结转移表完全推导，不携带独立会议级信息；为状态机对称性而保留会污染正式枚举 |

移除 `invocation_waiting` 后已同步：`meeting.schema.json`（枚举）、`manifest.sha256.json`（哈希刷新）、本 doc；**无任何 JS/测试引用该值，零行为影响**。

### 13.3 Gate 状态（F1 后）

| Gate | 结果 |
|---|---|
| Node Tests | **PASS**（156/156，含拆分后 12 条合同测试，零回归） |
| Contract Tests | **PASS**（D3D0-01..12 全过） |
| Browser Gate（Playwright 真机 29/29） | **NOT VERIFIED**（沙箱无 Playwright 且安全策略拦截下载，未能补跑） |
| Script Assembly（TEST-129） | **PASS** |
| Dead Reference | **PASS**（无旧文件名 / invocation_waiting 残留） |
| Schema JSON / Manifest 一致性 | **PASS** |
| Line Audit | **PASS**（≤110 例外已记录，其余 ≤100） |
| Blocking Issues | **1**（Browser Gate 未验证） |

> **D3-D0: KEEP OPEN · WEB_RELAY Contract: FROZEN（合同本身已冻结）· Browser Gate: NOT VERIFIED · Recommendation: 禁止进入 D3-R1，待人工在具备 Playwright 环境复跑 `node app/tests/run-browser.js` 并确认 29/29 后，方可宣布 D3-D0 CLOSED。**

### 13.4 固化规则（建议升格为项目纪律）

**「未执行」是独立第三态：NOT VERIFIED —— 既不是 PASS，也不是 FAIL。**
本委员会自身处理「事实 / 推断 / 未验证信息」边界，开发过程应先做到：任何 Gate 未真实执行，必须显式标为 NOT VERIFIED，不得用「仅加法改动、理论上无回归风险」代替实际门禁。
