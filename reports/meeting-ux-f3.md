# MEETING-UX-F3 · Center Workspace Simplification

> 报告日期：2026-08-09
> 阶段位置：MEETING-UX-F3 — 实现完成，Node 203/203 · Browser 250/250 全绿。
> 基线：Node 203/203 · Browser 208/208（MEETING-REPLAY-F1 收口）零回归。

## 1. 一句话

中央不再「同等级功能块塞一屏」：改为**单一滚动工作区**（meeting-workspace，flex:1 + min-height:0 + overflow-y:auto），内容多少都行、放不下中央自己滚；Validation 与 Record Status 从主流程降级为**后台能力**（PASS 静默、FAIL 才轻提示）；Prompt/Response 恢复主体地位（150/180px 起步可调）；Timeline 固定底部。

## 2. 方案 T01..T08 → 落地对照

| 条款 | 落地 |
|---|---|
| T01 单一 Scroll Workspace | `CenterStage` 每个模式面板内包 `div.meeting-workspace`（run/seat 两个容器）；CSS `flex:1 1 auto; min-width:0; min-height:0; overflow-y:auto; overflow-x:hidden`；**只有中央滚** |
| T02 删除固定高度思维 | 删除 `.workarea-pair` 双栏 grid（改纵向文档流）、textarea `flex:1; resize:none` 挤压、`@media (max-height:800px)` 与 `@media (max-height:760px)` 两段矮屏压缩规则（全删）；无 absolute/负 margin/translate 补丁遗留 |
| T03 Validation 降级 | `RelayVerdict.build` 重写：未校验→null、PASS→null（静默）、FAIL→轻提示「⚠ 回答存在校验问题 [查看详情]」+ 详情抽屉（V01–V05 清单）；**关键修复**：校验 FAIL 走 rejected 终态后 activeSession 消失，FAIL 卡片改为由 `lastCheck` 驱动在 idle 态也渲染（直到下次校验更新） |
| T04 Record Status 降级 | 删除常驻「尚未写入正式会议记录」块；accept 转变瞬间显示 Toast「✓ 已写入会议记录」（CSS `toast-fade` 2s 淡出，**无 JS timer**——项目禁 setTimeout）；失败仍走 relay-msg 持久提示 |
| T05 Prompt/Response 主体 | `#relay-prompt` min-height 150px、`#relay-paste` min-height 180px，均 `resize: vertical`；内容超长 textarea 自己滚，整个工作流超长 workspace 滚 |
| T06 操作层级 | 一级（复制提示词/提交回答/接受为正式发言/自动发送）保持 primary 主色；二级（全选/拒绝/重试/取消）secondary；三级（校验详情/审计）只按需展开 |
| T07 Timeline 固定 | 保持 console-drawer 底部固定（不进 workspace）；顺带修正**偏差 A**：标签改 `nodes[cur-1]`（显示「最后已重放」节点而非「下一个」节点） |
| T08 Browser 门禁 | 新增 runF3：**4 视口（1366×768 / 1440×900 / 1792×856 / 1920×1080）× 10 项** = 40 项（L01 页面本体不滚 / L02 Timeline 固定可见 / L03 席位可见 / L04 workspace 唯一滚动容器 / L05 无 record+校验常驻块 / L06 Prompt≥140 Response≥170 / L07 FAIL 才轻提示 / L08 PASS 静默 / L09 滚动后席位不滚走 / L10 控件 overlap=0） |

## 3. 契约调整（方案推翻旧展示契约，测试随方案更新）

| 旧契约 | 新语义 |
|---|---|
| B12「校验状态为通过」 | 校验通过**静默**（`#relay-validation` count=0） |
| B13「V01–V05 五条全亮」 | 校验通过后无详情清单常驻；清单检查移至 FAIL 场景（B23b：超长文本触发 V04 → 轻提示 + 详情含 ❌） |
| B16「存在尚未写入警告」 | 未提交时**无**「尚未写入」常驻块（count=0） |
| B23/B24 | 拆为 B23（V04 FAIL 轻提示）+ B23b（详情清单）+ B24（有效回答 PASS 静默）+ B24b（接受成功） |
| S13 | 校验通过改静默断言 |
| F01 | 「页面/左/中/右均无滚动条」→「页面/左/右无滚动条 + 中央 workspace 为滚动容器」（F3 推翻了「中央不滚」） |

## 4. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node | **203/203**（零回归） |
| Browser（真实 Chrome） | **250/250**（208 零丢失 + 40 项 F3 + 2 项 B 拆分；B12/B13/B16/S13/F01 语义更新） |
| 单文件 ≤100 行 | **PASS**（relay-panel 99 / relay-verdict 43 / relay-workarea 82 / center-stage 74 / timeline-panel 78） |

## 5. 测试数量说明（延续只读核查口径）

Browser 208 → **250**（+42：F3 40 项 + B23b/B24b 2 项拆分；无删除）。Node 203 不变。

## 6. 待办登记

1. **偏差 B**（SeatStatus 阶段内口径：summary 阶段 A1/B1 显示「等待发言」而非「已发言」）——上轮发现，超出本轮范围，未改。
2. Live ChatGPT Automation E2E（主线下一步）。
