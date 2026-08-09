# MEETING-REPLAY-F1 · Timeline Replay（会议时间轴 / 只读回放）

> 报告日期：2026-08-08
> 阶段位置：MEETING-REPLAY-F1 — 实现完成，Node 203/203 · Browser 208/208 全绿。
> 基线：Node 191/191 · Browser 197/197（含 ONE-SCREEN-F1 与 MEETING-UX-F2 已提交内容）零回归。

## 1. 一句话

把会议变成**可回放的状态序列**：底部常驻时间轴（Round → Step 两级），`[◀ 上一步] / [下一步 ▶] / [回到当前]` 只改变 UI 回放游标，绝不触碰 Runtime/Message/EventLog/PendingAction——**历史不可篡改，允许自由回看**（会议录像机，不是 Undo）。

## 2. 方案 T01..T10 → 落地对照

| 条款 | 落地 |
|---|---|
| T01 冻结语义 | `ReplayCursor` 只存 cursor（-1=跟随最新）；prev/next/toLatest 不碰 Meeting（TEST-174/175/176/183 验证 live 字节级不变） |
| T02 两级时间轴 | `MeetingReplay.buildTimeline`：Round=phase_entered 节点；Step=agent_output_received（"X 已发言"）/human_decision/phase_completed 节点；node={sequence,round,phase_id,kind,label,event_cursor,timestamp} |
| T03 Event Cursor | Timeline Node 只记 event_cursor；Replay State = events[0..cursor-1] 派生（`replayStateAt`），**不复制整份 Meeting**，无第二事实源 |
| T04 Display State Provider | `ReplayProvider.get(state)` 唯一出口：`displayState = live \| replay 视图`；SeatColumn/SeatCard/SeatStatus/MeetingHud/RelayPanel/TimelinePanel/meetingSummary 全部消费它（组件不自判 replay，TEST-184 验证幂等一致） |
| T05 底部时间轴 UI | TimelinePanel 常驻条：`[◀ 上一步] ●…● [下一步 ▶] [回到当前]` + 当前节点标签；展开 = 节点详情 + 事件日志；最新节点标「当前」 |
| T06 Replay Mode | 回放时中央顶部黄色横幅「⏱ 正在查看历史状态 · R?/Step? [回到当前会议]」；mt-step/finish/continue/battle/save/load、relay 全部操作按钮禁用（R04 验证）；relay 区显示只读提示 |
| T07 Seat Replay | 回放视图 = meeting-shaped 只读投影（participants 同 live；pendingAction/phase/status 由 events 重建；stateData 浅拷贝并清空 web_relay 防未来中继会话泄漏）；B1 执行前=待执行/执行后=已发言（TEST-180 + R05 验证） |
| T08 Persist | 存档已含 events（meeting-archive.js `events: clone(...)`）→ save/load 后 buildTimeline 一致（TEST-182 验证） |
| T09 防御性门禁 12 项 | TEST-173..184（timeline 单调 / 上一步不改 live / replay 不产 Message / 不产 PendingAction / 下一步恢复 / 回到当前 / mutating 判定 / B1 before-after / 跨阶段 / save-load / live 不被污染 / displayState 一致） |
| T10 不做 destructive undo | 本轮零删除历史能力；「Fork From Here / 从此节点新建会议分支」仅登记设计（未来轮次） |

## 3. 关键设计决策

1. **ReplayCursor 用 -1 表示 live**：初始/回到当前/清空会议后 cursor=-1（跟随最新）；新会议 events≥1 时不会被误判为回放（修复了首版 cursor=0 导致新会议直接进回放的 bug）。
2. **回放视图清空 stateData.web_relay**：activeSession 依赖 `stateData.web_relay` 找中继会话——回放视图若保留会暴露「未来」的会话；浅拷贝后删除该键，同时保留 battle_participants 等（resolveRequired 的 selected_participants 依赖）。
3. **required 参与者用简化解析**（与 Runtime 规则一致：all_advisors/side/role_class/participant_ids/selected_participants）；selected_participants 读 live stateData（battle_participants 写入后不变，稳定）。
4. **审计结论（T00b）**：Event Log 足够重建 UI（phase/round/spoken/received/status/pending 全覆盖）；messages 内容不在 events 中——当前 UI 无消息列表组件，故不做；若未来加消息列表，需 events 补 message_id 引用（登记）。
5. **F2 兼容**：MeetingHud（F2 新增）也接入 displayState（回放时 HUD 显示历史 phase/round/status）；F1 的 dev-tools 折叠在 1792×856 下被挤出视口，R 系列测试先展开 drawer。

## 4. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node | **203/203**（191 零回归 + TEST-173..184 十二项） |
| Browser（真实 Chrome） | **208/208**（197 零回归 + R01..R07：时间轴常驻/节点增长/回放横幅/mutating 禁用/席位历史状态/回到当前/无新事件） |
| 单文件 ≤100 行 | **PASS**（新增/变更生产文件全部 ≤100；meeting-replay 100、relay-panel 100、console-actions 100） |

## 5. 新增/变更文件

```
新增 app/js/harness/meeting-replay.js        # buildTimeline + replayStateAt + resolveRequired（100 行）
新增 app/js/ui/harness/replay-cursor.js      # 回放游标（-1=live）（34 行）
新增 app/js/ui/harness/replay-provider.js    # Display State 唯一出口 + mutatingDisabled（41 行）
新增 app/tests/protocol-test-cases-meeting-replay.js  # TEST-173..184（12 项）
变更 timeline-panel.js（常驻时间轴条+展开）/ center-stage.js（回放横幅）/ seat-column.js（displayState+禁用）
变更 seat-card.js / meeting-hud.js / relay-panel.js / console-actions.js（reset 接线）/ index.html / app.css
```

## 6. 待办（如实登记）

1. **Fork From Here**（T10 未来项）：从历史节点新建会议分支——设计已定（原会议 M1→…→M5，从 M3 分叉 M3'），未实现。
2. **messages 内容入事件**（可选增强）：未来加消息列表时，agent_output_received 的 payload 补 message_id。
3. 人工真机验收：底部时间轴可拖/可点、回放横幅醒目、按钮禁用符合直觉。
