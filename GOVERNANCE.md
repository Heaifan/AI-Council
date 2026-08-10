# AI-Council 开发治理规则（GOVERNANCE）

> 本文件是 AI 顾问委员会项目的**正式开发治理规则**，与 `changelog.md`（变更记录）、`file-tree.md`（文件索引）并列。违反本文件的「完成定义」即视为开发轮次未完成。
>
> 生效日期：2026-08-10（T0+ 事故后强制固化）。历史沿革：本规则由 2026-08-09 晚「Git 提交/推送失效事故」正式确立——那次事故中，整条开发链（MEETING-RUNTIME-F1 + T25-F2..F5）全部成果停留于单机工作区，GitHub（跨设备唯一真源）长达约 7 小时未同步，成果存在单点丢失风险。

## 一、完成定义（CLOSED 唯一标准）

**任何开发轮次宣布 CLOSED 的唯一充分必要条件：**

```text
代码完成
+ 验证通过（正式门禁全绿）
+ 验收条件满足
+ Commit 成功
+ Push 成功
+ 远端一致（HEAD == origin/<branch>，ahead/behind = 0/0）
+ worktree clean（该轮按任务性质应当落库时）
```

**缺任何一个都不是完整闭环。** 以下状态一律不得宣布「完成 / CLOSED」：

```text
代码还只存在于本机工作区        → 未完成
Commit 没有产生                → 未完成
远程 GitHub 没有同步            → 未完成
```

AI 说「完成」没有意义，只有可验证的持久化状态才有意义。

## 二、状态措辞必须与 Git 状态严格对应

| Git 实际状态 | 允许的报告措辞 |
|---|---|
| 已实现、未提交 | `IMPLEMENTED · NOT COMMITTED` |
| 已提交、未推送 | `COMMITTED · NOT PUSHED` |
| 已推送、未完成验收 | `PUSHED · READY FOR ACCEPTANCE` |
| 全链闭环（第一节全部满足） | `CLOSED` |

禁止在任何未满足第一节的状态下报告：

```text
✅ 开发完成 / ✅ F1 完成 / ✅ TODO 8/8 closed / ✅ 阶段 CLOSED / ✅ 本轮结束
```

## 三、每轮 Git 强制门禁

每轮最终状态报告必须包含以下证据块（逐项真实取值，禁止省略）：

```text
Branch:      <当前分支>
HEAD:        <本地 HEAD 短哈希>
origin/<b>:  <远端 HEAD 短哈希>
ahead:       N        behind: N
worktree:    clean / N files changed
stash:       N
Commit:      <本次提交哈希或 NONE>
Push:        OK / NOT PUSHED
```

每轮必须验证：`HEAD == origin/<当前分支>`、`ahead = 0`、`behind = 0`；应当落库的轮次还必须 `worktree clean`。不满足即不得 CLOSED。

## 四、Commit + Push 默认规则

- 废止「等用户明确确认后再 Commit/Push」的错误思路。
- 用户验收**之前**：允许处于 `READY FOR USER ACCEPTANCE`，代码可暂未进入正式提交。
- 用户验收**通过之后**（用户明确「通过 / 可以 / 没问题 / 继续 / 完成 / 进入下一步」）：当前轮**自动执行** 最终验证 → Commit → Push → 远程一致性检查，**不得继续等待用户额外说「帮我提交 GitHub」**。

## 五、跨设备 Source of Truth

> **GitHub 远程仓库是跨设备开发唯一可信 Source of Truth。**

本地工作区、AI 聊天记录、状态报告、TODO 都不是 Source of Truth。只有已 Push 到 GitHub 的 Commit 才是跨机器可依赖的正式开发进度。

```text
本地代码存在 ≠ 已保存
Commit 存在  ≠ 已同步
Push 成功 + 远端确认 = 已完成持久化
```

## 六、每轮 TODO 必须包含持久化检查点

每轮末尾强制加入以下任务步骤（不是报告模板装饰，是正式任务步骤；任一项未完成，TODO 不允许全 closed）：

```text
[ ] Git 状态审查
[ ] 创建本轮 Commit
[ ] Push 当前分支
[ ] 验证 HEAD == origin
[ ] 验证 ahead/behind = 0/0
[ ] 输出 Commit Hash
```

## 七、长任务恢复点

持续较长、含多个独立修复点的任务：一旦形成清晰、可验证、可独立恢复的阶段性成果，应设置恢复点 Commit，禁止让数小时成果长期只停留在工作区。

同时禁止：

- 为「多 Commit」制造垃圾提交；
- 提交未验证的明显损坏状态；
- 破坏现有 Commit 历史；
- 未经允许 force push / rebase / 删除历史。

目标：**可恢复，而不是提交数量最大化。**

## 八、永久反例（2026-08-09 事故）

- **事故**：整条开发链（MEETING-RUNTIME-F1、T25-F2/F3/F4/F5）完成并全部门禁通过（Node 236/236、Browser 327/327、Offline 14/14），但从未 Commit、从未 Push；GitHub 停留在约 7 小时前的状态。
- **根因**：完成定义失效——把「代码完成 + 测试通过 + 报告完成」当成了完成，遗漏了「记录 + 提交 + 同步 + 确认」。
- **后果**：跨设备失去可信基线；成果单点存在（仅一台工作电脑）；若发生硬盘故障/工作区损坏/误操作，成果不可恢复。
- **教训（永久）**：开发闭环 = 实现 + 验证 + 记录 + 提交 + 同步 + 确认。**GitHub 不是开发结束之后顺手同步的备份，而是正式开发流程的一部分。**
