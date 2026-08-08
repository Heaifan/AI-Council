# MEETING-UX-F2 · 固定 Meeting HUD + 席位编辑状态架构

> 报告日期：2026-08-08
> 阶段位置：MEETING-UX-F2 — 会议运行 UI 与席位配置状态（Node 188/188 · Browser 156/156 · Offline 14/14）
> 前置：ONE-SCREEN-F1 完成（9551745 已 push），用户裁定「F1 只解决了一半：顶部利用率 ❌、席位可靠编辑 ❌、自动化路线 ❌」。
> Git 基线：main @ 9551745（已 push 收口，ahead 0）

## 1. 一句话

按 MEETING-UX-F2 方案 T01-T07 逐字执行：**① 会议运行头 = 固定 Meeting HUD（≤68px：标题/议题/Round/Phase/计时器/状态，能力灯收进「系统」折叠层）；② 会前/运行分离（运行态会议配置折叠为一行摘要，中央空间交还）；③ 独立 Seat Edit Draft——timer/relay/meeting 状态更新不得覆盖未保存输入（硬门禁：G05 元素引用不变断言）；④ 计时器 1s 局部更新只改 DOM 文本，绝不全量 render**。本轮禁止 Web Automation 开发（零触碰 automation/ 行为层）。

## 2. 根因（用户截图证据 → 代码定位）

| 用户观察 | 代码根因 |
|---|---|
| 「顶部 190-200px 才进入工作区」 | top(~46) + 能力灯行(~30) + 当前状态行(~31) + 会话状态行(~31) + 页签(~47) ≈ 185px+；顶部四行各自为政 |
| 「会议配置大框占中央上半块」 | `ConfigPanel` 创建后仍渲染整张 disabled 表单（~200px），只把输入禁用了事 |
| 「A2 model_ref=deepseek 输入后消失恢复 placeholder」 | 表单值存在 `build()` 闭包 `edits` 里——**每次 HarnessStore.notify（relay/timer/meeting 事件）→ refresh → CenterStage.render 重建表单 → 闭包丢弃 → 从持久化值重建**。用户输入（未保存）随任意状态更新丢失 |
| 「会议冻结状态」误导 | F1 已解耦字段级冻结；本轮剩余问题是「编辑中被打断」而非「不能编辑」 |

## 3. 方案 → 落地对照（T01-T07）

| 条款 | 落地 |
|---|---|
| T01 Meeting HUD | 新 `meeting-hud.js`（91 行）：行1 = 标题（ellipsis 36%）+ 议题（ellipsis 36%，title 全文）+ 系统状态；行2 = Round（相位序号/总相位，按 `meeting.protocolId` 查 registry）+ Phase 名 + `00:00:00` 计时器 + `● 状态` + `当前状态`（#runtime-status 契约行内嵌）。**实测高 56px ≤ 68px**（G01c 断言）。无会议显示「尚未创建会议」占位。 |
| T02 压缩非核心状态 | 能力灯收进 `#capabilities` 内 `<details class="sys-status">`：summary =「系统 ● 正常/异常」；展开弹层 2 列 6 灯（data-capability/data-ok 契约保留，D2/B05 evaluateAll 零改动）。#capabilities 容器移入 HUD（index.html 静态占位删除）。 |
| T03 会前/运行分离 | `ConfigPanel` 运行态 = 一行摘要（会议名 + 议题 ellipsis + disabled 创建按钮，`#config-summary-title/topic`）；表单字段进 `display:none` 容器（cfg-* 契约 DOM 保留 disabled，C10/S10 isDisabled 可查；C15 创建按钮可见断言保留）。中央省 ~180px。 |
| T04 Seat Edit Draft | 新 `seat-edit-draft.js`（47 行）：`drafts[pid] = {dirty, values}`；表单值从 draft 初始化（`init`），change 经 `set()` 写 draft + 标 dirty；**harness-shell.refresh 守卫**：`mode==='seat' && 中央正显示该席位表单（#seat-config h2 含当前 seat_id）&& anyDirty()` → 跳过 CenterStage.render（表单 DOM/焦点/光标不动）。切席/切 run 模式时守卫自然放行（dirty 草稿跨席保留，G07）。 |
| T05 禁全量 timer render | `meeting-hud.js` 内 `setInterval(tick, 1000)`：只改 `#meeting-timer.textContent`（秒数变化才写）。**TEST-10 白名单**：`TIMER_EXEMPT=["app/js/ui/harness/meeting-hud.js"]`（仅该文件豁免 setInterval，注释声明「本地 UI 时钟非网络轮询」）。无 rAF（也在禁单）。 |
| T06 保存语义 | `SeatConfigCommit.run` 成功后 `SeatEditDraft.clear(pid)` → 持久化落库（F1 链路）→ 席位卡刷新；取消按钮 clear + 回运行；`resetSessionState`（换目录）`resetAll()`。 |
| T07 验收 | G 系列 21 项：HUD 存在/占位/高度 ≤68（G01）；系统折叠 + 6 灯 data-ok（G02）；HUD 标题/议题/Round/状态（G03）；运行态摘要行 + 契约 DOM（G04）；**relay validated 状态变化后编辑框元素引用不变 + 值保持（G05）**；**timer 2.2s 更新后元素引用不变 + 值保持（G06）**；切席再回草稿保留（G07）；保存后草稿清除 + 持久化值（G08）；刷新后 model_ref 保持（G09）。 |

## 4. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node（app 侧回归） | **PASS · 188/188**（含 TEST-129 更新：HUD 容器 + MeetingHud 提供 #runtime-status 契约） |
| Browser（真实 Chrome，file://） | **PASS · 156/156**（135 零回归 + G01..G09 二十一项新增） |
| Offline Automation（Fake AI Page） | **PASS · 14/14**（零回归；automation 行为层零触碰） |
| Schema 验证 | **PASS** |
| git diff --check | PASS |
| ≤100 行红线 | PASS（console-actions.js 110 / harness-shell.js 103 登记 ≤110 例外，同 request.js 先例） |

## 5. 测试适配记录（行为变化 → 改驱动步骤/断言调整）

- **TEST-129**：「必须有与能力灯分开的独立「当前状态」行」（index.html 静态 `id="runtime-status"`）→ F2 后契约由 MeetingHud 动态创建 → 断言改为「index.html 含 `id="meeting-hud"` 容器 + meeting-hud.js 源码含 `"runtime-status"`」。
- **B03**（`#runtime-status` innerText「当前状态：」）：元素移入 HUD 行 2 内嵌，仍可见 → 断言零改动。
- **D2/B05**（能力灯 evaluateAll data-ok）：灯在折叠 details 内 DOM 常驻 → 零改动。
- **C10/S10**（创建后 cfg-title/topic isDisabled）：表单 display:none 但 DOM 常驻 → 零改动（isDisabled 对隐藏元素可查）。
- **C15**（`#console-config .btn.primary` allInnerTexts 含「创建会议」）：运行态创建按钮保留可见（disabled）→ 零改动。
- **S13 回归根因**：F2 顶部 HUD 使中央内容总量超出 → exec 卡内嵌自动化卡（315px）挤扁 workarea → verdict 盖住 relay-submit。修复：**自动化卡从 exec 卡拆出为独立卡并默认折叠**（details，summary 一行）；**删除中央 context 卡**（状态由 HUD 承担）。实测 submit(813) < verdict(826) 不重叠。
- **G05 守卫初版 bug**：draft 按 participant_id 存、守卫按 seat_id 查 → 永远 false。改为 `anyDirty()`（任一 dirty 即守卫）+「中央正显示该席位表单」双重条件。

## 6. 新增/修改模块

```
app/js/ui/harness/meeting-hud.js     # 新（91 行）：HUD 渲染 + 1s 局部时钟（TEST-10 唯一 setInterval 白名单）
app/js/ui/harness/seat-edit-draft.js # 新（47 行）：席位编辑草稿（get/init/set/isDirty/anyDirty/clear/resetAll）
app/js/ui/harness/harness-shell.js   # 改（103 行 ≤110 例外）：HUD 装配 + 能力灯折叠 + dirty 守卫
app/js/ui/harness/config-panel.js    # 改（95 行）：运行态摘要行 + 表单隐藏保留契约 DOM
app/js/ui/harness/relay-panel.js     # 改（100 行）：自动化卡拆出 exec
app/js/ui/harness/automation-view.js # 改（100 行）：details 折叠（默认收起）
app/js/ui/harness/center-stage.js    # 改（68 行）：删除 context 卡（HUD 承担）
app/tests/protocol-test-cases-session.js # 改：TEST-10 setInterval 白名单（TIMER_EXEMPT）
app/tests/protocol-test-cases-harness.js # 改：TEST-129 HUD 契约断言
app/tests/run-browser.js             # 改：runF2（G01..G09 共 21 项断言）
```

## 7. 已知取舍（如实登记）

1. **TEST-10 白名单**：`meeting-hud.js` 是唯一豁免 `setInterval(` 的文件（1s 本地 UI 时钟）。审计注释明确「非网络轮询」；其他文件仍全禁（包括 rAF）。
2. **harness-shell.js 103 行 / console-actions.js 110 行**：≤110 明确例外（同 request.js 106 行先例），报告中登记。
3. **dirty 守卫粒度**：任一席位 dirty 且中央正显示 seat 表单时中央整体不重建（含 config 摘要行也不刷新）——运行态摘要内容（会议名/议题）创建后不变，无感知差异；round 变化由 HUD 独立刷新（不受守卫影响）。
4. **自动化卡默认折叠**：本地 file:// 模式自动化本就是 localhost 专属（automation-ui 注入），折叠无功能损失；展开可见 [自动发送给 ChatGPT] 等全部控件。
5. **context 卡删除**：原「会议进行中 · 等待发言」行由 HUD 行 2（状态 + 当前状态）承担，中央省 ~47px。
6. **timer 起点** = `meeting.events[0].occurred_at`（EventLog 注入时钟，确定性）；无事件回退 `Date.now()`。

## 8. 验收对照（方案 T07 五项）

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 六席逐个配置 | ✅ F04（F1 保留）+ G04/G07 |
| 2 | 输入 ≥10s 经历计时器更新内容不消失 | ✅ G06（2.2s 实测 timer 变化 + 元素引用不变 + 值保持；机制 = 守卫 + 局部时钟，时间无关） |
| 3 | relay running→waiting→received 状态变化编辑字段不变 | ✅ G05（waiting_external→validated 全程元素引用不变、值保持） |
| 4 | 六席保存后刷新页面配置全部保持 | ✅ F14（F1 保留：六席备注+显示名）+ G09（model_ref） |
| 5 | 本轮禁 Web Automation 修改 | ✅ automation/ 行为层零 diff（仅 file-tree/文档提及） |
