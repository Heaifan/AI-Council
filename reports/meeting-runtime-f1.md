# MEETING-RUNTIME-F1 · 发言队列、入会检查与可逆正式发言 — 开发报告

> 轮次：MEETING-RUNTIME-F1 ｜ 基线：`7940111`（Node 203/203 · Browser 250/250 · Offline 14/14）｜ 交付：Node **217/217** · Browser **287/287**
> 前置：T01 根因审计（`meeting-runtime-f1-t01-audit.md`，用户裁定 PASS）+ T02 权威边界冻结（`meeting-runtime-f1-t02-boundaries.md`，四项修正并入）。

## 一、四个修正点的落地

| 修正 | 落地 | 验证 |
| --- | --- | --- |
| ① 单一 Roster 权威 | `getRoundRoster()` = `pendingAction.requiredParticipantIds`（enterPhase 唯一写入点，grep 证实零重解析）；无第二份数组 | TEST-185（roster 顺序 + 同一引用） |
| ② pending 全派生 | `derivePending = roster.filter(!hasEffectiveOfficial)`；唯一游标 `activeSpeakerId`（enterPhase 初始化 roster[0]，submitResult/revoke 推进） | TEST-186/187/189（推进与撤回恢复） |
| ③ 6/6 不再自动切阶段 | `submitResult` 收齐 → `READY_TO_ADVANCE`；显式 `advancePhase()` 才 `completeAndTransition`；撤回 → 派生回 `running` | TEST-188/194、R1T-08/09 |
| ④ Live/Replay 一致 | 追加事件 `agent_output_revised/revoked`；`meeting-replay.js` 顺序消费 revoked（spoken 移除）；receivedParticipantIds = 当前有效完成集合（accept add / revoke remove），一致性测试锁死 | TEST-195 |

## 二、死锁根因链修复（问题 A）

```
A1 accept → received=[A1] → session 终态 → 中央回 idle        （修复前）
↓
无 activeSpeaker 状态位 + 无接受后自动轮转 + 无轮转前入会检查   → 死锁
```

修复后：

```
A1 正式接收 → A1 Done → derivePending → candidate=A2 → 推进 activeSpeaker=A2
→ selectedSeat 跟随（Runtime 主动导航）→ autoOpenNext（web_relay 自动打开工作区）
→ 每轮轮转前 Turn Admission Check（admitted 继续 / blocked 停留 + 原因 + 配置入口）
```

## 三、语义冻结清单（T05/T06/T08/T09/T11/T15）

- `activeSpeakerId`：会议调度器正在等谁（唯一游标）。Blocked 时**停留在该席位**，绝不跳席、绝不回退。
- `selectedSeatId`：用户正在查看/配置的席位。Runtime 自动导航时跟随；用户点击只改查看（`selectOnly`，不切模式）。
- 调度目标 `nextTarget`：activeSpeaker 未完成则优先它（撤回后保持当前轮不抢屏），否则 roster 序 pending[0]（撤回席按原始顺序回归，无手工 push/pop）。
- 导航：`← 上一席 | 当前 A2 · 2/6 | 下一席 →`（只浏览）；6/6 才出现「进入下一阶段 →」。
- Mock「模拟下一席响应」从正式导航移入开发工具区（与会议导航语义断开，T10）。
- Admission：`admitted / blocked`（配置就绪口径，不假装 online；`externalReady` 留待 Live Automation）。
- 正式发言：`official → superseded / revoked`（extensions 开放袋，零 schema 变更；历史永不物理删除；会议上下文只取 latest active official）。

## 三.5、正式指令（§五～§四十九）差距补齐

- **R05/R12 六席全亮修复（T11/T36/T41）**：`seat-status.js`「当前发言」由 `required-received` 派生改为 `activeSpeakerId` 唯一驱动——「尚未完成」≠「当前发言」。Browser 硬断言：顺序阶段当前发言标签 ≤1（开场 1 / 轮转 1 / 全完成 0）。
- **T07/T14 席位绑定**：`RelayFlow.accept` 增加校验——接受对象必须 ∈ 本阶段 required 且当前有效未完成；串席/重复接受返回 `INVOCATION_STATE_TRANSITION_INVALID`（不再默默 accept）。
- **T08/T42/T43 validated UI**：`relay-workarea.js` validated/accepted 后「提交回答」禁用（无重复提交入口）；Runtime guard 保留为第二道防线。
- **T49 错误分类**：`UIText.ERROR` Invocation 类文案（「当前状态不允许执行该操作。」）与校验失败文案独立；Runtime transition 错误不再冒充回答质量问题。

## 四、测试矩阵

- **Node +14**（TEST-185..198）：N01 roster 顺序 / N02 A1→A2 / N03 连续六席 / **N04 validated≠received** / N05 A2 blocked 停留不跳 A3 / N06 修复重试 / N07 浏览不影响调度 / N08 修改 V1 superseded+V2 生效 / N09 撤回回 pending+事件 / N10 6/6→5/6→补答 6/6 / **N17 错误码分类** / Replay 一致性 / Preflight / accept 席位绑定校验。
- **Browser +32**（R1T-01..22，真实 Chrome 六席流程，非塞最终状态）：点名 → A1 中继 accept → 自动 A2 → mock 完成 → 6/6 → 显式进入下一阶段；**当前发言 ≤1 全链硬断言（T41：开场 1 / 轮转 1 / 全完成 0）**；**validated UI 三断言（T42/T43：提交禁用 / received 仍 0 / 接收入口存在）**；**T49 错误分类断言**；A2 中途 Blocked → 阻塞卡+原因+停留 → 修复自动恢复；撤回 A1 → 0/6 → 补答（roster 顺序）→ 重新 6/6；修改 V1→V2 上下文切换；**Replay E2E（T47）：Accept+Revise+Revoke+Re-Accept 历史 → Live phase/received/completion == Replay 全量重建（R1T-19..22）**。
- **回归**：既有 Node 203 全适配（stepUntil/runOnce 模拟用户点击「进入下一阶段」；TEST-34/36/37/45/50/52/75/WR-05/WR-12/TEST-181 语义更新）；既有 Browser 255 零丢失（D2 循环重写、R04b/R06b 改 mt-advance、S 系列点名确认、mt-step 移入开发工具）。

## 五、门禁

- Node **217/217**、Browser **287/287**（真实 Chrome，含 F3 四视口回归 L01..L10）✓
- 所有手写文件 ≤100 行（meeting-runtime.js 288 行为 D1 既有豁免文件；新增 7 个模块 24–82 行）✓
- 无临时脚本残留（hermes temp 已清理）✓
- worktree 未提交（T21 用户确认后 commit + push）✓

## 六、真机人工验收指引（T20，用户执行）

用议题「**AI 顾问委员会下一阶段，是否应该优先实现"全自动多模型会议"，即使这会暂时牺牲部分人工可控性和调试透明度？**」真机跑：

1. 打开 `app/index.html` → 选目录 → 填议题 → 创建会议 → **点名卡**（六席 ✓ 已入会）→ 开始 Round 1
2. A1（ChatGPT）中继：生成提示词 → 粘贴回答 → 校验 → 接受 → **自动进入 A2**
3. 继续 A2..B3（模拟按钮在开发工具区）→ 6/6 → 「进入下一阶段 →」可用
4. 撤回任一席 → 5/6 + 历史 Revoked；补答 → 6/6
5. 修改任一已发言席 → 上下文取新版本

六张证据图建议：①点名卡 ②A1 接受后自动 A2 ③中途 3/6 ④6/6 + 进入下一阶段可用 ⑤撤回后 5/6 ⑥补答后 6/6。
