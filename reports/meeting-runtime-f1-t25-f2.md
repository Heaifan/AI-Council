# MEETING-RUNTIME-F1-T25-F2 · Admission 误放行与阶段导航语义修复 — 开发报告

> 轮次：T25-F2（真机验收暴露）｜ 基线：F1 主体（Node 217/217 · Browser 287/287）｜ 交付：Node **219/219** · Browser **298/298**

## 一、真机暴露的两个问题（用户裁定）

1. **Admission 误放行（阻塞级）**：A2 未配置模型（transport=mock）却被推进为「当前发言」——截图证实六席模板的 mock 席位（A2..B3 model_ref 为空）被 `admissionOf` 的 mock 豁免直接放行。**Preflight 因此也未拦住**（点名卡全绿、Round 1 可开始、A1 正常发言）。
2. **导航语义**：1/6 时底部仍渲染灰色「进入下一阶段」（原实现 disabled 而非隐藏），用户误以为「下一步为什么锁了」。

## 二、修复内容

| ID | 修复 | 落点 |
| --- | --- | --- |
| F2-01/02 | 根因确认：`meeting-admission.js:25-30` mock 席位完全跳过 model_ref/url 检查（用户怀疑的 `transport==="mock" → admitted` 成立） | — |
| F2-03/04 | **Admission Contract 写死**：required 席位必须 seat/role/transport/**model_ref/模型名称/模型 URL/safe URL** 全齐，任一不成立 → `blocked`。**transport=mock 不再自动放行**；仅 `stateData.dev_mode=true`（开发/测试会议）且 mock 时豁免——mock 是测试能力，不是正式会议兜底模型 | `meeting-admission.js`（62 行，新增 `isDevMock`） |
| F2-03b | **Preflight 真正挡在开会前**：点名卡显示「⚠ A2 未指定模型 无法入会」+「N 个 required 席位尚未就绪」+ [配置未就绪席位] [重新检查]；「开始 Round 1」disabled | `preflight-panel.js`（69 行） |
| F2-04b | **Turn Admission**：运行中配置失效 → `activeSpeaker` 停留该席 + 中央阻塞卡（原因 + [配置该席位]），不跳 A3 不回 A1 | 复用 relay-blocked（R1T-10/B03 验证） |
| F2-05 | 阻塞原因明确（未指定模型/模型名称未配置/模型网页未配置） | admission 检查细分 |
| F2-06 | 「配置 → 保存 → 重新检查」恢复链（重新检查 = notify 派生重查） | preflight-panel |
| F2-07/08 | **导航语义收口**：running 状态**不渲染**「进入下一阶段」（不再有灰色按钮）；仅 `READY_TO_ADVANCE` 才出现；底部导航显示「A2 · 当前发言 · 1/6」（完成时「全部完成 · 6/6」） | `seat-column.js`（97 行）、`seat-nav.js`（48 行） |
| 附带 | 六席模板补全模型配置（A2=claude-web/A3=gemini-web/B1=chatgpt-web/B2=claude-web/B3=gemini-web）——正式会议模板席位不再裸奔 | `seat-layout.js` |
| 附带 | demo（createDemo/createRelayDemo）标记 `dev_mode=true`（开发测试模式） | `relay-flow.js`/`meeting-step-flow.js` |
| 附带 | **seat-config-commit 两个既有 bug**（六席模板补配置后暴露）：①`origModelRef || model_ref` 导致改 model_ref 时 upsert 旧值；②改 model_ref 未改显示名时旧名覆盖目标 profile（默认表 Claude 被 ChatGPT 覆盖） | `seat-config-commit.js`（55 行） |

## 三、测试

- **Node +2（TEST-199/200）**：mock+无模型正式模式 → blocked（B02 语义）；dev_mode mock 豁免 + 关闭后恢复严格。
- **Browser +11（B01..B06 + 附属）**：B01/B02 Preflight 阻塞 + 开始禁用 + 点名行「⚠ A2 未指定模型 无法入会」；B02b 同；B03 运行中配置失效阻塞停留 + 原因 + 配置入口；B04/B04b 补齐 + 重新检查恢复；B05/B05b 1/6 无「进入下一阶段」+ 底部当前发言/进度；B06/B06b 6/6 唯一出现 + 「全部完成」。
- **回归**：Node 217→219 零丢失；Browser 287→298（H03 系列因 seat-config-commit 修复恢复 + D2/R04b/R1T 段 2 适配 mt-advance 隐藏语义）。

## 四、门禁

- Node **219/219** · Browser **298/298**（真实 Chrome fresh，含 F3 四视口 + 全量 R1T/B/H/S/D 系列）✓
- 全部 ≤100 行（meeting-runtime.js 288 行 D1 豁免）✓ · `git diff --check` PASS ✓ · 临时脚本已清理 ✓
- worktree 未提交（T26 前）✓

## 五、真机复验指引（T25-A2）

1. 新建会议（六席模板）→ **点名卡应全绿**（模板已配模型）
2. 把 A2 模型引用清空 → 点名卡显示「⚠ A2 未指定模型 无法入会」+「1 个 required 席位尚未就绪」→ 开始 Round 1 禁用 → [配置 A2] 或 [重新检查]
3. 补回 A2 模型 → [重新检查] → 恢复 → 开始 Round 1
4. A1 中继 accept → 自动 A2 → 途中清空 A2 模型 → **A2 阻塞卡**（不跳 A3）→ 修复 → 继续
5. 全程底部无灰色「下一步」；6/6 才出现「进入下一阶段 →」
