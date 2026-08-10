# Changelog — AI 顾问委员会 v0.1

> 格式参考 Keep a Changelog。所有变更按时间倒序。

## 治理 · T0+ 事故恢复与 CLOSED 定义固化 — 2026-08-10

- **事故**：2026-08-09 晚整条开发链（MEETING-RUNTIME-F1 + T25-F2/F3/F4/F5）全部成果**从未 Commit、从未 Push**，GitHub 停留在约 7 小时前；门禁全绿但成果单点存在于工作电脑，跨设备可信基线失效。
- **恢复**：全量门禁复核（Node 236/236 · Browser 327/327 · Offline 14/14 · Schema PASS · diff --check PASS）→ 恢复 Commit `87a815f`（66 files, +2529/−452）→ Push → 远端一致（HEAD == origin/main，ahead/behind = 0/0，worktree clean，stash 0）。
- **固化（制度层）**：新增 `GOVERNANCE.md`——CLOSED = 验证通过 + Commit + Push + 远端一致 + worktree clean；状态措辞与 Git 状态严格对应（IMPLEMENTED·NOT COMMITTED / COMMITTED·NOT PUSHED / PUSHED·READY FOR ACCEPTANCE / CLOSED）；每轮 Git 证据块；用户验收通过后自动 Commit+Push；GitHub 为唯一 Source of Truth；长任务恢复点规则；本次事故登记为永久反例。

## MEETING-RUNTIME-F1-T25-F5 · 秘书席位化与 Summary 闭环 — 2026-08-09

- **架构裁定（用户）**：取消独立 System Phase Executor——拿六席之一给秘书 AI（默认 A3 = meeting-secretary / chair_secretary），summary = 正常 **1/1 席位阶段**，复用中继/validated/accept/revoke/replay 全管线。
- **三层名单**：Physical Seats ≠ Meeting Roster（A1,A3,B1）≠ Phase Roster（opening=[A1,B1] 2/2、summary=[A3] 1/1）。Protocol 零改动（summary 早已按 role_class 解析，秘书换席不改规则）。
- **秘书 Prompt**：注入上一阶段全部委员有效正式发言（revoked 排除、superseded 只取最新、保留 source=response_id）；**秘书汇总成为下一阶段所有委员共享的同一份上下文**。
- **Preflight 协议级必需角色**：缺秘书/双秘书/秘书未配置模型 → 开会前阻塞（不等到 Round 2 才发现）。
- **UI**：A3 固定占 A3 卡（不显示阵营）、辩论期「等待秘书阶段」/汇总期「当前汇总·等待秘书回答」、委员跨阶段「上阶段已发言」、「委员 N · 秘书 M」点名标题、「接受为正式秘书汇总」。
- **门禁**：Node **236/236**（+S01..S13）· Browser **327/327**（+F5-01..06 完整 A1→B1→秘书→1/1→Round3 共享上下文 E2E）。报告 `reports/meeting-runtime-f1-t25-f5.md`。

## MEETING-RUNTIME-F1-T25-F4 · activeSpeaker → Workspace 自动同步 — 2026-08-09

- **真机暴露**：右侧「B1 · 当前发言 · 1/2」但中央停在 A2 空席配置——Runtime 已推进 activeSpeaker=B1，UI 的 selectedSeat/workspace 无人同步（六项只读确认：accept/step 均不写 selectedSeat；navSeat 存在按物理六席遍历的旧逻辑）。
- **修复**：`ConsoleActions.followActiveSpeaker()`（自动推进后 selectedSeat 同步到当前发言人，只改查看）接入 accept 与 mock step 两条链；`seat-nav` 上一席/下一席改遍历 **Phase Roster**（1v1: A1↔B1，空席不参与）；selectedSeat ≠ activeSpeaker 时出现「回到当前发言」；确认 selectedSeat 单一写入口（无渲染反写竞争）。
- **门禁**：Browser **319/319**（+W01..W07b 十一项：自动同步/invariant/回看不污染/回到当前/B1 Prompt 身份正确/三人 invariant）。报告 `reports/meeting-runtime-f1-t25-f4.md`。

## MEETING-RUNTIME-F1-T25-F3 · 可变参会名单与空席语义 — 2026-08-09

- **建模纠正（用户裁定）**：六席是会议室容量，不是每场必须坐满。三层模型：Physical Seats ≠ Meeting Roster（participants，本场名单）≠ Phase Roster（Protocol 在参会名单内解析）。1v1/三人/任意 2～6 人组合合法；未配置席位若未勾选参会 → 「未参会」完全不阻塞。
- **cfg-create 默认只带已配置席位参会**（chair 保留）；点名页六席全显 ☑/☐ 勾选（开始后冻结），勾选 = 加入/移出 participants + `reenterPhase` 重解析当前阶段 roster（runtime 新增，仅未开始时），按物理席位顺序重排保证发言顺序。
- **Preflight 只检查参会成员**：✓ 已就绪 / ⚠ 无法入会（阻塞开始）/ ○ 未参会（不阻塞）；标题「会议点名 · Round 1 · 本场 N 人」；进度分母动态（1v1→2/2）。
- **附带**：seat-status「空席」→「未参会」；D4 测试隔离修复（D2 mt-save 残留存档）；replay/TEST-149 适配 F3 语义。
- **门禁**：Node **223/223** · Browser **319/319**（+M01..M07 + W01..W07 可变名单十项）。报告 `reports/meeting-runtime-f1-t25-f3.md`。

## MEETING-RUNTIME-F1-T25-F2 · Admission 误放行与阶段导航语义修复 — 2026-08-09

- **真机暴露（用户裁定）**：A2 未配置模型（transport=mock）被 `admissionOf` mock 豁免误判为「当前发言」，Preflight 同样未拦住；1/6 时底部渲染灰色「进入下一阶段」造成导航误导。
- **Admission Contract 写死**：required 席位必须 seat/role/transport/model_ref/模型名称/模型 URL/safe URL 全齐，任一不成立 → `blocked`；**transport=mock 不再自动放行**（仅 `dev_mode` 开发/测试会议豁免——mock 是测试能力，不是正式会议兜底模型）。Preflight 在开会前真挡：点名卡「⚠ A2 未指定模型 无法入会」+ 未就绪统计 + [配置未就绪席位] [重新检查]；Turn Admission：运行中配置失效 → 停留阻塞（不跳席不回退）。
- **导航语义收口**：running 状态不再渲染「进入下一阶段」（无灰色按钮）；仅 READY_TO_ADVANCE 出现；底部「A2 · 当前发言 · 1/6」。
- **附带修复**：六席模板补全模型配置（正式会议模板席位不再裸奔）；seat-config-commit 两个既有 bug（model_ref 变更 upsert 旧值 / 旧显示名覆盖目标 profile）。
- **门禁**：Node **223/223** · Browser **308/308**（+B01..B06 + M01..M07 六条 Admission/导航门禁）。报告 `reports/meeting-runtime-f1-t25-f2.md`。

## MEETING-RUNTIME-F1 · 发言队列、入会检查与可逆正式发言 — 2026-08-09

- **目的**：修复「A1 完成后会议卡死」根因链——无 activeSpeaker 状态位 + 无接受后自动轮转 + 无轮转前入会检查。本轮把会议运行时最小闭环一次补完整：会议知道本轮谁要发言、谁已入会、轮到谁、谁已完成；正式接收后自动检查并跳转下一位；允许修改/撤回已接收的正式发言。**不重做 F3 UI、不做 Live ChatGPT、不扩协议**（用户冻结范围）。
- **T01 根因审计（10 项，用户裁定 PASS）**：`reports/meeting-runtime-f1-t01-audit.md`——「下一步」实为 Mock 驱动按钮；无 activeSpeaker 独立字段；roster 每次 enterPhase 重新解析；received 只有 push 不可逆；completion 单调假设（收齐即自动切阶段）；无 admission 概念；messages 不支持 revision/revoke。
- **T02 权威边界冻结（4 项修正并入）**：`reports/meeting-runtime-f1-t02-boundaries.md`——①单一 Roster 权威 = `pendingAction.requiredParticipantIds`（enterPhase 唯一写入点，grep 证实 phase 生命周期内零重解析），`getRoundRoster()` 语义包装，无第二份数组；②pending 全派生（`roster.filter(!hasEffectiveOfficial)`），只有 `activeSpeakerId` 是游标；③6/6 不再自动切阶段（`READY_TO_ADVANCE`）；④修改/撤回走追加事件（`agent_output_revised/revoked`），Live 与 Replay 最终状态必须一致。
- **新增模块（全部 ≤100 行）**：`harness/meeting-admission.js`（Runtime Admission 合同：席位/角色/transport/模型/URL/roster 归属；mock 豁免模型检查；`admitted/blocked` 不假装 online，未来 `externalReady` 接口）；`harness/meeting-turn-selector.js`（getRoundRoster/derivePending/deriveCompleted/phaseStatus/nextSpeaker/nextTarget）；`harness/meeting-response-state.js`（latestOfficial/revise/revoke + 事件追加 + received add/remove + activeSpeaker 保持规则）；`ui/harness/seat-nav.js`（上一席/当前 A2 · 2/6/下一席，只改查看不改调度）；`ui/harness/preflight-panel.js`（开会前点名卡，全部 admitted 才可「开始 Round 1」）；`ui/harness/relay-blocked.js`（当前发言人阻塞卡：原因 + [配置该席位]）。
- **Runtime 行为变更**：`enterPhase` 初始化 `activeSpeakerId=roster[0]`；`submitResult` 收齐后**停在 READY_TO_ADVANCE**（不再自动 completeAndTransition），显式 `advancePhase()` 才进入下一阶段；`revoke` 后 completion 重新派生（6/6 → 5/6）；撤回时若已轮到后面的人则保持 activeSpeaker 不抢屏，调度目标 = `nextTarget`（activeSpeaker 未完成优先，否则 roster 序 pending[0]）。
- **UI**：Mock「模拟下一席响应」从正式导航移入开发工具区（语义断开）；summary 卡新增「进入下一阶段 →」（仅 6/6 可用）+ 导航条；席位卡已发言席出现 [修改][撤回]（修改走 prompt 输入，V1 superseded / V2 official，上下文只取最新版；撤回保留 revoked 历史）；当前发言人 blocked 时中央显示阻塞卡；正式建会（cfg-create）走点名卡，demo 自动确认。
- **Replay 一致性（修正 4）**：`meeting-replay.js` 顺序消费 `agent_output_revoked` 事件（spoken 移除），`revised` 不改完成集合；Live/Replay 最终状态一致（TEST-195）。
- **测试**：Node **219/219**（+TEST-185..200：N01 roster 顺序/N02 accept 推进/N03 连续六席/N04 收齐不切/N05 blocked 停留/N06 修复重试/N07 浏览不影响调度/N08 修改/N09 撤回/N10 撤回重算 + Preflight + Replay 一致性；既有 203 全部适配 READY_TO_ADVANCE 语义）；Browser **298/298**（+R1T-01..22 + B01..B06 六席真实闭环：点名 → A1 中继 accept → 自动 A2 → mock 完成 → 6/6 → 进入下一阶段；异常链 A2 blocked 停留/原因/修复恢复；撤回 → 0/6 → 补答 → 6/6；修改 V1→V2 上下文切换）。
- **状态**：`MEETING-RUNTIME-F1: IMPLEMENTED · Node 217/217 · Browser 287/287 · 待用户真机验收（T25）后 CLOSED`。
