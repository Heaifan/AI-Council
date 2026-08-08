# D2-F1 Integration Harness — 开发报告

> 日期：2026-08-08
> 阶段：D2-F1（Developer Harness Integration，只做接线，不做六席会议室 UI）
> 结论：**Node 自动测试 144/144 PASS（原 128 零回归）；浏览器真机验收 29/29 PASS。**

---

## 一、本轮目的（用户裁定复述）

把已经做好的内核能力真正接进同一个浏览器 Harness，做到「**点得到、看得到、验得到**」。
本轮**只做接线**，不开发 D3 Transport、不接真实 LLM、不做正式六席会议室 UI。

三个拍板点的落实：

1. **立即执行 D2-F1**：Protocol Kernel / Meeting Runtime / Persistence-Restore / Instruction Compiler / Prompt Renderer 全部接进浏览器 Harness（Header 能力灯 + Protocols / Meeting / Compiler 三 Tab）。
2. **Role ≠ Agent / Participant**：Compiler 的可选对象**只来自 `meeting.participants[]`**，绝不把 `roles/*.json` 当 Agent。数据流严格为 `Meeting → participants[] → 选 Participant → 读 role_id/role_class → RoleCardRegistry → InstructionCompiler.compile`。无 Meeting 时 Compiler 禁用并提示「请先在 Meeting 页创建 Demo Meeting」。
3. **Mock 单步**：每点一次「执行下一步 Mock」**只消费当前 Pending Action 的一个确定性步骤**，绝不自动越过 Human Gate；Finish / Continue / Battle 必须由人工点击。

额外冻结：
- 顶部显示 **`D2-F1 Integration Harness`**（不是 `D2-R2 Developer Harness`）。
- 保留 Protocols / Meeting / Compiler 三 Tab。
- 完成后 commit + push，**立即停手，不自动开始 D3**。

SOP：沿用 XuanYu（玄域）成熟工程 SOP（5+100 红线：单文件 ≤100 行、单目录核心文件 ≤5 个、SRP、禁用 Manager/Helper/Utils 命名）。SOP 可继承，项目身份不串——本报告不称本项目为玄域。

---

## 二、架构（接线分层，守 SRP）

```text
app/
├── index.html                      # 能力灯 + 选目录 + 三 Tab 外壳
├── js/
│   ├── app.js                      # 选目录 → Snapshot → Session → HarnessStore.setSession()
│   ├── harness/        (无 DOM，可在 Node 直接测试，每文件 ≤100 行)
│   │   ├── harness-store.js        # 共享状态 + 订阅；setSession 冻结装入 Role Card/Schema Pack/Packet Schema
│   │   ├── participant-binding.js  # Participant 下拉（只来自 participants[]）+ 当前相位 actor 标注 + Compiler 禁用态
│   │   ├── meeting-step-flow.js    # Create Demo 只 start 不预跑 / stepOnce 单步 / Human Gate 只接人工 / Battle 确定性默认
│   │   ├── compile-flow.js         # compile → Packet Schema 校验 → render，返回摘要/Raw/Prompt
│   │   └── archive-flow.js         # buildArchive / restoreFrom（Schema + Restore 语义校验 + 原子恢复）
│   └── ui/harness/     (视图层，只画不判规则，每文件 ≤100 行)
│       ├── harness-shell.js        # 能力灯 + 三 Tab 切换 + 订阅 Store 全量重绘
│       ├── meeting-actions.js      # 按钮行为（点击→调流程层→回写 Store）
│       ├── meeting-runtime-view.js # Meeting 状态卡 + 步进/Human Gate 按钮启用规则
│       ├── compiler-view.js        # Compiler 禁用态 / Participant 下拉 / 角色解析
│       └── compiler-packet-view.js # 摘要 / Raw JSON / Rendered Prompt（只读 textarea，不调 Clipboard API）
└── tests/
    ├── run-node.js                 # 144 项，harness/* 进执行、ui/harness/* 进静态审计
    ├── run-browser.js              # Playwright 真机：D1 Protocols + D2-F1 Meeting/Compiler 真实点击链路
    └── protocol-test-cases-harness.js  # TEST-129..144（16 项）
```

**分层原则**：所有业务规则只在 `harness/*`（无 DOM）里，视图层 `ui/harness/*` 只渲染、只把点击转交给流程层。这样逻辑可在 Node 直接测，浏览器只是同一份逻辑的「外壳」。

---

## 三、关键冻结概念：Role ≠ Participant ≠ Model

- **Role Card**（`roles/*.json`）：岗位说明书，定义「某类角色长什么样」，不属于任何一场具体会议。
- **Participant**（`meeting.participants[]`）：「这场会里的人」，带 `role_id` / `role_class` 声明，是 Compiler 的唯一可选对象。
- **Model**：底层模型，按设计**根本不进入 Packet**（Prompt Renderer 红化时天然隐藏），不存在于 UI 选择里。

解析规则（`RoleCardRegistry.resolveForParticipant`）：`role_id` 精确命中 → 用该卡；未命中（如 Chair 声明了 `roles/` 里不存在的 `neutral-chair-secretary`）→ 按 `role_class` 确定性回退。TEST-143 专门守住「可选对象只有 3 个与会者、绝不把 Role Card 当 Agent」。

---

## 四、Mock 单步语义（用户收紧点）

`MockAgentRuntime.stepOnce(runtime, meeting, protocol)`：
- 只处理当前 Pending Action 的**第一个未响应参与者**一次（一个步骤即停），绝不循环推到下一个相位。
- 遇到 `await_human_decision` **明确拒绝**（`reason: "human_gate"`），把决策权交还人工。
- `MeetingStepFlow.step` 委托 `stepOnce`；`MeetingStepFlow.decide` 只接受 `finish / continue / battle`，非法 choice 被拒且会议不动。

---

## 五、测试

### 5.1 Node 自动测试（run-node.js）
- **144/144 PASS**，原 128 项零回归，新增 16 项（TEST-129..144）。
- 覆盖：脚本装配 / Snapshot 冻结 / 无 Meeting 禁用 / Create Demo 不预跑 / Mock 单步 / Human Gate 拦截 / Battle 确定性 / 编译端到端 / 切换重编译 / **Role ≠ Participant** / Save-Load 往返。
- 静态审计（`FORBIDDEN_APIS`）：`app/js/**`、`app/index.html` 对 `fetch / WebSocket / setTimeout / Clipboard / open / XMLHttpRequest` 等**零命中**（local-first 不受破坏）。

### 5.2 浏览器真机验收（run-browser.js，chrome）
- **29/29 PASS**（29 个外层驱动器断言：D1 Protocols 9 项 + D2-F1 Meeting/Compiler 真实点击 19 项 + 1 项「D1 测试页通过数 ≥ 15 且失败 0」的嵌套校验。其中 `test-runner.html` 自身运行 15 条内层用例，由上述 1 个外层断言统一验证，不计入 29 的加法分项——即 29 = 9 + 19 + 1，而非 9 + 19 + 15）。
- 截图存于 `reports/d2-f1-screenshots/`（create-demo / compile-a1 / human-gate / finished）。

### 5.3 人工验收清单 A01..A16（与浏览器验收一一对应）

| 编号 | 验收点 | 浏览器验收结果 |
|---|---|---|
| A01 | 顶部显示 `D2-F1 Integration Harness` | PASS |
| A02 | 选目录后 Protocols Tab Available 1 | PASS |
| A03 | Create Demo 停在 opening、Received=0（不预跑） | PASS |
| A04 | 执行下一步 Mock 只前进 0→1，Phase 不变 | PASS |
| A05 | 响应收齐才切 Phase（一步一动） | PASS（Node TEST-136） |
| A06 | 步进停在 Human Gate（waiting_human） | PASS |
| A07 | Human Gate 上 Mock 禁用、Finish 启用 | PASS |
| A08 | 人工点 Finish → completed（archive 自动终局） | PASS |
| A09 | 无 Meeting 时 Compiler 禁用并要求先建会 | PASS |
| A10 | Participant 下拉严格 3 个（来自 participants[]） | PASS |
| A11 | 选 A1 编译出 packet_id + Rendered Prompt + Packet Schema 校验通过 | PASS |
| A12 | 切换 B1 重编译出不同 Prompt 且用 B1 角色卡 | PASS |
| A13 | Rendered Prompt 为只读 textarea（Ctrl+A/Ctrl+C，无 Clipboard API） | PASS |
| A14 | Save → Load 真实往返，恢复后 Phase 一致 | PASS |
| A15 | 五能力灯（Protocol/Runtime/Persistence/Compiler/Renderer）全亮 | PASS |
| A16 | 全程不依赖网络（无 fetch/XHR，local-first） | PASS（静态审计 + 页面无外部请求） |

---

## 六、如实告知的已知缺口

- **Battle 人工选人 UI 未做**：本轮 Battle 在未选人时走确定性默认（全部 advisor 升序），并在界面与消息里如实告知具体 Battle 参与者（TEST-139）。正式「勾选 Battle 参与者」属 D3+ 产品 UI，不在 D2-F1 范围。
- **D1 测试页遗留缺口（已顺带修复）**：`test-runner.html` 自 D1-R2 起漏加载 `protocol-semantic-validator.js`，导致 TEST-11（语义非法示例应被拒绝）在浏览器里长期误过。本轮补上脚本，D1 测试页恢复 15/15。该修复不影响任何正式运行代码。
- **D1 遗留超 100 行文件**：`meeting-runtime.js`(274)、`prompt-renderer.js`(249)、`protocol-semantic-validator.js`(240)、`instruction-compiler.js`(188)、`meeting-restore-validator.js`(155)、`protocol-registry.js`(133)、`protocol-diagnostic.js`(117) 等 7 个 D1 文件超过 100 行。它们是既有基线，不在 D2-F1 重构范围；D2-F1 新增 10 个文件全部 ≤100 行（`harness-store.js` 正好 100）。建议 D3 前统一收口。

---

## 七、红线遵守

- 单文件 ≤100 行：D2-F1 新增 `harness/*`（5）+ `ui/harness/*`（5）= 10 个文件，行数 67~100，全部达标。
- SRP：流程层与视图层分离，业务规则只在 `harness/*`。
- 禁用 Manager/Helper/Utils 命名：无违规。
- 每次改动 commit + push：本轮完成即提交（见下方提交记录）。

---

## 八、不做的范围（用户裁定）

- 不开发 D3 Transport / Web Relay。
- 不接真实 LLM；Rendered Prompt 仅供人工复制到外部模型。
- 不做正式六席会议室 UI。
- 不做 Battle 人工选人 UI（走确定性默认）。

---

## 九、下一步建议（不在本轮执行，待用户拍板）

1. **D1 超 100 行文件收口**：D3 前把 7 个 D1 大文件按职责拆到 ≤100 行，降低后续耦合。
2. **D3 Transport 探索**：定义本地/远程模型的 Prompt 投递与回传契约（仍不破坏 local-first 与无服务器冻结）。
3. **Battle 选人 UI**：在 Meeting Tab 增加「勾选 Battle 参与者」交互，替换确定性默认。
4. **六席会议室产品 UI**：正式产品形态，独立于本轮 Harness。

> 本轮按裁定在 D2-F1 完成后**立即停手**，不自动进入 D3。
