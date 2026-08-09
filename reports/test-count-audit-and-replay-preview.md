# 测试数量差异只读核查 + Timeline 回放行为预演（2026-08-09）

> 性质：只读核查（零代码修改）。用户提出的 MEETING-REPLAY-F1 收口前两项待办：
> ① 解释 Node 205→203 / Browser 264→208；② 1vs1 Timeline 回放行为预演。
> 所有结论基于 git 历史（log/reflog/grep -S）、注册表 diff 与真实 Chrome 驱动（临时脚本，已清理）。

## ① 测试数量差异核查

### 结论：没有任何测试意外丢失；用户基线为「合并口径」；用户点名的两组专项在本仓库任何历史中不存在。

| 证据 | 结果 |
|---|---|
| git 全历史 `git log -S` 搜索「F2F2 / 几何 / Active Seat / mixed transport / B1 Message / all accepted / summary 后 / PARTICIPANTS」 | **全零匹配**——这些测试名从未存在于任何提交 |
| `git log --oneline` / `git reflog` / `git branch -a` / `git tag` | main 单分支线性链，无被丢弃提交、无隐藏分支/标签；reports/ 无 PARTICIPANTS 报告 |
| 各提交测试数扫描（git grep -c） | Node：00dc40e=185 → 79437d5=191 → e37ae9e=203（单调递增，**零删除**）；Browser 字面 check：95 → 152 → 163（单调递增） |
| 注册表 diff（79437d5 → e37ae9e，`git diff --stat`） | 仅 +12 Node 测试（replay）、+11 Browser check（R 系列）、+2 注册行；**0 删除 0 合并 0 迁移** |

### 数字来源解释

- **Node 205 = 191（79437d5 实测）+ 14（Offline Automation）的合并口径**。当前按同一口径 = 203 + 14 = **217**（比 205 还多 12，正是 MEETING-REPLAY 新增）。
- **Browser 264**：与任何提交的实际运行数（99 → 197 → 208）和字面 check 数（95 → 163）均不匹配，无 git 依据。264 = 208 + 56，但 56 项在历史中无对应物。
- **「MEETING-PARTICIPANTS-F1-F1」轮次在本仓库无痕迹**（git log/reflog/reports/changelog 全无）——最可能：该轮在本地工作区完成但从未提交（随后被 b89d313 F1 重构提交覆盖），或基线记录来自另一个环境/会话。仓库侧无法恢复不存在的内容；**当前套件实际覆盖用户点名的等价门禁**：

| 用户点名门禁 | 当前等价覆盖 |
|---|---|
| 1vs1 mixed transport | TEST-159（六席模板 A1=web_relay）+ WR-04/05（web_relay accept→submit）|
| B1 Message 落库 | WR-05（accept→runtime.submitResult）+ TEST-144（accept 写 messages）|
| all accepted 才切 phase | protocol-test-cases-runtime（receivedParticipantIds 计数语义，TEST-1xx）|
| summary 后 seat status | run-browser S11（当前席位高亮）+ S 系列 |
| F2F2 42 项几何防遮挡 | **不存在**（git 全历史零匹配；当前 run-browser 无此系列）|
| Active Seat P1 系列 | **不存在**（git 全历史零匹配；当前 run-browser 无此系列）|
| Replay R01..R07 | **存在**（本轮新增，11 项 check 全 PASS）|

### 处置

按用户条款：**「若只是统计口径变化，在 changelog/报告中明确登记」** → 本报告登记。测试数量口径今后统一为：
`Node 套件 = 203（零删除，单调递增）· Browser 套件 = 208（零删除）· Offline = 14`。

---

## ② 1vs1 Timeline 回放行为预演（真实 Chrome 驱动，Mock Demo A1/B1 + Chair）

### 验收表实际观察（cursor 粒度 = 每条事件一步）

场景：创建 Demo → step×2（A1 完成 → B1 完成 → opening 完成 → 进入 summary/Round 2），events=8（含 2 个 checkpoint_created）。

| 操作 | 实际观察 | 判定 |
|---|---|---|
| 前置：live Round 2 | HUD=Round 2/秘书汇总；seat：A1=等待发言 B1=等待发言（summary 阶段 pending 只有 chair，见偏差 B）| ⚠ 见偏差 B |
| 点「上一步」 | cursor 8→7；状态=opening 完成（spoken=[a1,b1]）；标签显示「R2 · summary」（见偏差 A）| ⚠ 见偏差 A |
| 再点「上一步」 | cursor 7→6；opening 完成、pending 清空；seat 等待发言（阶段结束无 pending）| ✅ |
| 再往前 | cursor 6→5；opening 进行中 received=[a1,b1]；**seat：A1=已发言 B1=已发言** | ✅ 历史正确恢复 |
| 点「下一步」 | cursor 5→6；按历史顺序回退的镜像推进 | ✅ |
| 点「回到当前」 | cursor → -1；立即回 live：HUD=Round 2；A1/B1 在 opening 阶段记录仍为已发言（events 层）| ✅ |
| 历史模式执行按钮 | mt-step/mt-save/mt-load 全 disabled；relay 区「历史回放中」只读提示 | ✅ |
| **关键：live 未倒退** | back 后 events 仍 8 条、phase=summary、status=running、spoken 含 a1+b1——**真实会议未倒退** | ✅ **核心语义成立** |

### 两个展示层偏差（如实上报，未修改代码）

**偏差 A · Timeline 标签偏移 1**：`TimelinePanel` 用 `nodes[cur]` 显示「当前节点」，但回放状态对应「最后已重放的事件」= `nodes[cur-1]`。现象：点一次「上一步」后标签显示「R2 · summary」（下一个节点），而实际状态是「opening 完成」。修正 = 1 行（`curNode = nodes[cur-1]`），**未改**（本轮只读）。

**偏差 B · SeatStatus 阶段内口径**：`seat-status.js` 的「已发言」只在**当前 pendingAction 内**成立（required 含且 received 含）；跨阶段后（如 summary 阶段）A1/B1 不在 chair 的 pending 中 → 显示「等待发言」。live 与回放一致。用户验收表期望「Round 2 时 A1=已发言 B1=已发言」→ 需改为 events 派生的「全局已发言集合」（spoken 含即已发言）。这是既有 D3 语义，**未改**（超出只读范围，待用户裁定）。

### 结论

- **回放核心语义（会议录像机）实现正确**：历史可回看、mutating 全禁、回到当前 live 原封不动（事件/阶段/状态零倒退）。
- 真人验收建议按上述「实际观察」执行；偏差 A/B 是否纳入修复由用户裁定（预计各 1 行 / 1 个函数级改动）。
