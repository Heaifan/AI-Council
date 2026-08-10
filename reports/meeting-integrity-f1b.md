# MEETING-INTEGRITY-F1-B · Response Validation Pipeline — 2026-08-10

> 轮次：MEETING-INTEGRITY-F1-B（F1 总方案第二轮；F1-A CLOSED 后按序执行）
> 目标：**Transport 成功 ≠ Runtime 接受**；严格 Output Contract 校验；normalized_content 生效。
> 门禁：Node 264/264 · Browser 344/344 · Offline 14/14 · Schema PASS · diff --check PASS

## 一、F1-B-01 审计结论（先查后改，方案 §1）

真实链路（用户粘贴 → 推进）：

```text
RelayFlow.receive → T.receive → state=response_received, result.status=success（normalized_content=null）
→ 用户点提交 → WC.validate → V01–V05 形状校验 → T.validate（仅非空）→ state=validated
→ 用户点接受 → WC.accept（T.accept 状态机）→ RelayFlow.accept
→ MeetingRuntime.submitResult → receivedParticipantIds.push(pid)   ← 无条件入列
→ 收齐 → ready_to_advance → advancePhase → phase_completed
```

**根因位置**：
1. `agent-web-relay-controller.js` `validate()`（V01–V05）：只查句柄/状态机/非空/长度/参与者——**从不解析协议 `output_contract`**。协议层 json_schema（position/reasons/risks 等）与 required_sections（claim/rebuttal/remaining_uncertainty）全部存在但**零代码引用**。
2. `agent-web-relay-transport.js` `receive()`：`Res.create` 不传 normalizedContent → 恒 null。
3. `meeting-runtime.js` `submitResult()`：`receivedParticipantIds.push` 无内容校验条件（方案所指「收到 response → push → advance」模式成立）。

## 二、实现

### 新模块 `invocation/output-contract-resolver.js`（93 行 ≤100）

- `validate(raw, contract)` → `{mode, is_valid, parser_error, schema_errors[], missing_sections[], additional_properties[], normalized_content}`（方案 §6 冻结形状）。
- **strict JSON**：`JSON.parse` 解析**整个字符串**（仅 BOM 移除/首尾空白/CRLF 归一）——`{json}\n\n是否需要我…`、leading prose、malformed 全部天然抛错 → parser_error；**无截取、无正则修复、无静默去尾**（方案 §2 逐字）。
- **JSON Schema**：AjvBundle 编译 json_schema（allErrors）→ schema_errors（`$.path message`）；additionalProperties 错误提取字段名（**Ajv2020 的字段名在 `params.additionalProperty`，instancePath 为空——实测修正**）。
- **Text Contract**：required_sections 标题行定位（trim 等于小节名或带 # 前缀），缺失/空 → missing_sections（方案 §4）。
- `normalized_content`：JSON → 解析对象；text → BOM/CRLF/trim 归一文本。**PASS 恒非 null**（方案 §3）。

### 三态拆分（方案 §5/§7，核心合同）

| 状态 | 位置 | 语义 |
|---|---|---|
| `transport_success` | T.receive → Result.status=success | 内容已到达 |
| `validation_success` | T.validate + OCR（V06） | 内容符合 Output Contract |
| `runtime_accepted` | RelayFlow.accept 显式断言 `validation.is_valid` | 才可入 received |

- V06 FAIL → **VALIDATE_FAIL 事件 → rejected**（复用状态机既有路径）；participant 不入 received（pending 保持）、phaseStatus 恒 running、**advance 不可能**（方案 §7 硬门 B11/B12/B14/B15 锁定）。
- 空响应与 contract FAIL 区分：空 → EMPTY_RESPONSE（V03）；非空不达标 → INVOCATION_OUTPUT_CONTRACT_FAILED（V06）——错误码不互相污染。
- 旧存档/旧会话无 validation 记录 → accept 放行兼容（向后兼容，不破坏既有存档恢复）。

### normalized_content 落库

PASS 时重建 Result（`Res.create` 同 requestId/status/at → **content-address 同 result_id**，确定性无副作用）；`validation` 随 session 持久化（controller.sync 扩展，Save/Load 断点续传保留）。

### UI（F1-B-10）

- 新错误码 `INVOCATION_OUTPUT_CONTRACT_FAILED`（protocol-diagnostic.js + ui-text.js 中文文案）。
- RelayVerdict 详情展开 V06 精确原因：解析错误 / 缺少小节 / Schema 错误（前 5 条）/ 不允许的字段。
- V06 被拒后回 idle（既有 F3 行为：rejected 为终态，activeSession 归 null）——用户重新 relay-open 提交修正版（M04 路径）。

## 三、契约语义更新（方案 §9 回归要求）

V06 加入后，**Browser 全部 relay 输入升级为合法 JSON**（协议 structured_json 合同的真实形状），依赖原文本的断言改为 JSON 内子串：

| 位置 | 更新 |
|---|---|
| D3 B12/B23 段、S12 段、R1T 系列、M/W 系列、F5 段、F1A 段 | 粘贴内容 → `{"position":...,"reasons":[...],"risks":[...]}`（opening）/ 秘书四字段（summary）/ `{"challenges":[...]}`（critique） |
| WR-01 | 校验条数 5 → 6（V01–V06） |
| F2 G05/G06 | 动作层 paste → JSON |
| 空响应/超长测试 | 保留（V03/V04 先于 V06，错误码不变） |

## 四、测试

- **Node** `protocol-test-cases-integrity-f1b.js`（TEST-226..245 = B01..B20）：
  - B01–B07 strict JSON（合法/尾巴/前导/缺字段/additionalProperties/类型/malformed）
  - B08–B10 text sections（完整/缺 rebuttal/空小节）
  - B11–B15 Runtime 链（FAIL 保持 pending / 不完成 / retry 恢复 / 一席非法不完成 / 全部合法才完成）
  - B16–B20 回归（Opening/Summary/Critique/Human Gate/Battle text contract）
- **Browser** `runF1B`（F1B-M01..M05c，12 条）：全真实中继链 M01 合法 accept → M02 JSON+尾巴拦截不推进 → M03 缺字段拦截 → M04 修正恢复 accept → M05 battle 缺 rebuttal 拦截。

## 五、取舍登记

| 项 | 说明 |
|---|---|
| rejected 后 UI 回 idle（无 retry 按钮） | 既有 F3 设计；用户重新 relay-open 提交修正版（Node 层 retry API 保留可用） |
| 旧会话无 validation 放行 | 兼容旧存档恢复；新会议必带 validation |
| mock 路径不受 V06 约束 | mock 是测试桩（dev_mode 豁免先例），不经 RelayFlow |
| messages 落库 | 仍属 F1-C（本轮严格不做） |
| InvocationMessageFactory 读 normalized_content.text | JSON 对象无 .text → 回退 raw_response——F1-C 消息链统一处理 |

## 六、Git 证据

提交时输出 Branch/HEAD/origin/ahead/behind/worktree/stash/Commit Hash（GOVERNANCE.md 闭环）。
