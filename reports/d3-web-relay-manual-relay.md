# D3 · WEB_RELAY — Manual Relay（Work Item: Manual Relay）

> 报告日期：2026-08-08
> 阶段位置：D3 · WEB_RELAY（Manual Relay）— 实现完成，自动测试全绿；**Browser 真机门禁 NOT VERIFIED（沙箱无 Playwright），待开发机复跑**。
> 前置条件（已满足）：WEB_RELAY Contract Freeze（D3-D0 CLOSED）、Node 156/156、Contract 12/12、Chrome 真机 29/29、依赖与 Git 收口。

## 1. 这一轮到底做了什么（一句话）

把系统从「只能跑 Mock 会议」推进成「能接一个真实外部 AI 的回答并写进会议」，但**系统绝不自动相信外部 AI**：你复制 Prompt → 粘贴回答 → 系统做 5 条硬校验 → 你点 Accept → 被接受的内容才落成正式会议消息 → Runtime 接着推进。

这就是你最初定下的唯一产品性验收标准：

> 你能从 AI-Council 页面复制一名委员的 Prompt 给我，我回答以后，你把我的回答粘回去；系统不直接相信我，而是在校验并经你 Accept 后，才把我的话正式写进会议，再由 Runtime 继续会议。

## 2. 四道闸门数据流（核心不变量）

```text
① 复制 Prompt ── readonly textarea（WebRelayView）── 不调 Clipboard API，刻意 local-first
        │
② 粘贴 Response ── WebRelayActions.paste → RelayFlow.receive → WebRelayTransport 存原文
        │
③ 校验 V01–V05 ── WebRelayController.validate（复用冻结错误码，不新增）
        │              V01 句柄有效        STALE_INVOCATION
        │              V02 状态机在 response_received（默认 ok）
        │              V03 原文非空        EMPTY_RESPONSE
        │              V04 长度 ≤ 20000    INVALID_RESPONSE
        │              V05 参与者仍在会议  PARTICIPANT_NOT_FOUND
        │
④ 接受并写入 ── WebRelayController.accept → RelayFlow.accept
        │              → MeetingRuntime.submitResult（写 agent_output_received 事件，Runtime 决定 Phase 跳转）
        │              → InvocationMessageFactory.create+append（meeting.messages 写入 accepted_by_runtime=true）
        ▼
   Runtime 继续会议（下一 Pending Action / Phase 转移）
```

**红线（用户裁定，已落实）**：
- Runtime 不知道 ChatGPT —— 代码中**无任何** ChatGPT/Claude/Gemini/OpenAI/browser/textarea/DOM 概念；只有 `web_relay` 这个 transport_kind 与 Prompt/Response 文本。
- AI 的回答**不能直接成为会议事实** —— 没有 `Paste → meeting.messages.push(...)` 捷径；必经 validate→accept 两道人工+系统校验。
- Human Gate 仍不是 Transport —— `waiting_human` 时 WEB_RELAY 必须完全停下；web_relay 参与者命中时 `MeetingStepFlow.step` 返回 `{ok:false, reason:"web_relay"}`，绝不替外部 AI 推进。

## 3. 文件组织（新增 6 个，修改 6 个）

### 新增（全部 ≤100 行核心红线；测试文件 145 行，仓库既有测试文件已不受此约束）
| 文件 | 行数 | 职责（单一） |
|------|------|------|
| `app/js/invocation/agent-web-relay-controller.js` | 56 | **协调层**：open / receive / validate(V01–V05) / accept / reject / retry / cancel / hydrate / state / sessions。无 DOM、无网络、不生成 Prompt。 |
| `app/js/invocation/invocation-message-factory.js` | 43 | 把**已 Accept**的 Result 落成正式 Meeting Message（`accepted_by_runtime=true`，`validation.status:"valid"`）；绝不凭空生成事实。 |
| `app/js/harness/relay-flow.js` | 82 | Harness 编排层：把 CompileFlow（Prompt 生成）与 WebRelayController（relay 生命周期）接合；`routeStep` 供 step 委托停下；`createRelayDemo` 造含 web_relay 的演示会议；依赖项调用时取 `A.*`（修复 Node 加载顺序敏感）。 |
| `app/js/ui/harness/web-relay-view.js` | 57 | 面板渲染：readonly Prompt textarea + 复制按钮、粘贴 textarea、V01–V05 校验清单、接受/拒绝/重试/取消按钮（启用规则来自校验态）。 |
| `app/js/ui/harness/web-relay-actions.js` | 37 | 面板点击行为：模块内持有当前 handle / 最近校验结果（不污染 Store）；只调流程层。 |
| `app/tests/protocol-test-cases-web-relay-flow.js` | 145 | WR-01..13 流程测试（见 §4）。 |

### 修改（接线点，均守 ≤100 红线）
| 文件 | 改动 |
|------|------|
| `app/js/harness/meeting-step-flow.js` | 98 行（原 103，压缩注释达红线）。`step()` 改为先 `A.RelayFlow.routeStep(meeting)`；`auto===false` 返回 `{ok:false, reason:"web_relay"}` 停下；否则委托 `MockAgentRuntime.stepOnce`。 |
| `app/js/ui/harness/harness-shell.js` | 73 行。能力灯新增 `["WebRelay", ...]`；`refresh()` 在 Meeting Tab 内嵌 `MeetingRuntimeView.render` + `WebRelayView.render`。 |
| `app/js/ui/harness/meeting-actions.js` | 80 行。新增 `createRelay()`（造 web_relay 演示会议）；`load` 后加 `A.RelayFlow.hydrate` 断点续传。 |
| `app/js/ui/harness/meeting-runtime-view.js` | 86 行。控制栏新增 `Create Relay Demo` 按钮。 |
| `app/index.html` | invocation 组加 `invocation-message-factory.js`；harness 组加 `relay-flow.js` + `web-relay-actions.js` + `web-relay-view.js`。 |
| `app/tests/run-node.js` | RUNTIME 注册 `relay-flow.js` → `agent-web-relay-controller.js` → `invocation-message-factory.js` → `protocol-test-cases-web-relay-flow.js`；AUDITED 尾部注册 controller / message-factory / web-relay-actions / web-relay-view。 |

## 4. 测试与门禁状态（完成门禁逐项）

| # | 门禁 | 结果 | 备注 |
|---|------|------|------|
| 1 | Node Tests ALL PASS | ✅ PASS | **169/169**（原 156 零回归，新增 13 项 WR） |
| 2 | 新增 WEB_RELAY Tests ALL PASS | ✅ PASS | WR-01..13 全过 |
| 3 | Browser Tests ALL PASS | ⚠️ **NOT VERIFIED** | 沙箱无 Playwright；run-browser.js 已含 B01..B20 待开发机复跑 |
| 4 | Contract Tests ALL PASS | ✅ PASS | D3D0-01..12（12/12） |
| 5 | Script Assembly PASS | ✅ PASS | TEST-129 装配审计；index.html / run-node.js 注册一致、无死引用 |
| 6 | Dead Reference PASS | ✅ PASS | 无旧文件名 / invocation_waiting 残留 |
| 7 | Schema/Manifest PASS | ✅ PASS | 零 Schema 改动（复用既有 event_type / participants.transport_kind / state_data 开放袋）；manifest 未变 |
| 8 | Line Audit PASS | ✅ PASS | 核心文件均 ≤100；request.js 106 享 ≤110 例外（D3-D0-F1 已记录） |
| 9 | Save/Load PASS | ✅ PASS | state_data.web_relay 存断点，Archive/Restore 往返 + hydrate 灌回（WR-13 覆盖） |
| 10 | Human Gate Isolation PASS | ✅ PASS | web_relay 命中时 step 停下，不自动推进（WR-11/WR-12） |
| 11 | Git clean | ⚠️ 待执行 | 本轮改动尚未 commit（详见 §6） |
| 12 | HEAD==origin/main | ⚠️ 待执行 | 提交并 push 后满足 |
| 13 | Blocking Issues 0 | ⚠️ 1（Browser Gate NOT VERIFIED） | 沙箱限制，非代码缺陷 |

**结论**：实现与自动测试全绿；因沙箱无 Playwright，**Browser Gate 维持 NOT VERIFIED**，不得宣布 D3 WEB_RELAY 整体 CLOSED，须开发机复跑 B01..B20 + 人工验收 A01..A10。

## 5. 19 项 TODO 进度（本轮）

| # | TODO | 状态 |
|----|------|------|
| 01 | 基线 / 冻结确认 | ✅ 完成（D3-D0 CLOSED） |
| 02 | 数据流设计 | ✅ 完成（§2 四道闸门 SVG） |
| 03 | Invocation Controller | ✅ 完成（agent-web-relay-controller.js） |
| 04 | Runtime → Invocation 接线 | ✅ 完成（meeting-step-flow 路由 + relay-flow） |
| 05 | Manual Relay UI | ✅ 完成（web-relay-view + actions + harness-shell 内嵌） |
| 06 | Copy Prompt | ✅ 完成（readonly textarea + 复制按钮） |
| 07 | Paste Response | ✅ 完成 |
| 08 | Response 校验 V01..V05 | ✅ 完成（controller.validate） |
| 09 | Accept / Reject | ✅ 完成 |
| 10 | Message 转换 | ✅ 完成（invocation-message-factory.js） |
| 11 | Runtime 回填与继续推进 | ✅ 完成（submitResult + append） |
| 12 | Cancel / Retry | ✅ 完成 |
| 13 | Save / Load 恢复 | ✅ 完成（state_data + hydrate） |
| 14 | Event Log | ✅ 完成（复用 agent_output_received，不新增枚举） |
| 15 | Browser 真机测试 B01..B20 | ⚠️ NOT VERIFIED（沙箱无 Playwright） |
| 16 | 自动测试 | ✅ 完成（169/169） |
| 17 | 文档同步 | 🔄 进行中（本报告 + file-tree/changelog） |
| 18 | commit + push | ⚠️ 待执行 |
| 19 | 人工验收 A01..A10 | ⚠️ 待执行（需开发机手动演练） |

## 6. Stop Conditions（6 条）自检

- 改 Meeting Runtime 核心数据模型？❌ 未改（submitResult 复用既有路径）。
- 改冻结 Protocol Schema？❌ 未改（零 Schema 改动）。
- 需浏览器自动化？❌ 未用；Manual Relay 全人工搬运。
- 需 API Key？❌ 未用任何 LLM API。
- 两次修复仍不过同一 Browser Gate？N/A（本轮未跑 Browser）。
- 单文件承担两职责以上？❌ 每文件单一职责，均 ≤100 行。

**无触发任何 Stop Condition。**

## 7. 人工验收清单（A01..A10，开发机演练）

1. A01 打开 `app/index.html` → 能力灯 `WebRelay ✅`。
2. A02 点 `Create Relay Demo` → 生成含 `agent-a1=web_relay` 的会议，停在当前 Phase。
3. A03 Meeting Tab 内出现 Manual Relay 面板，显示「参与者 agent-a1 为 web_relay」。
4. A04 点「打开 Manual Relay」→ 出现只读 Prompt（复制一份给你）。
5. A05 把 Prompt 贴进外部 AI（如 ChatGPT）→ 把回答粘回粘贴框。
6. A06 点「校验 V01–V05」→ 五条全 ✅，状态 `validated`。
7. A07 点「接受并写入会议」→ 会议 messages 新增一条 `accepted_by_runtime=true` 的消息；Runtime 推进（Pending Action 该参与者标记已收到）。
8. A08 故意粘贴空响应 → 校验 V03 ❌，状态 `rejected`，可「重试」。
9. A09 粘贴超 20000 字符 → 校验 V04 ❌，`rejected`。
10. A10 Save → Load 存档 → hydrate 后 web_relay 运行态恢复，可继续 Accept。

## 8. 下一步

1. 在具备 Playwright 的开发机运行 `node app/tests/run-browser.js`，确认 Manual Relay B01..B20 全绿，把 Browser Gate 由 NOT VERIFIED 翻 PASS。
2. 人工走查 A01..A10，确认端到端体验符合最初验收标准。
3. 两项齐过后，宣布 D3 · WEB_RELAY CLOSED，进入下一阶段（D3-R2 自动校验 / D4 多 Agent，按你规划）。
