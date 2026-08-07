# Meeting Persistence Specification v0.1

> 状态：Phase 0 制度冻结版  
> 目标：保证会议可保存、恢复、审计、回放与分支。

## 1. MVP 持久化目标

D1 采用**单 JSON 会议存档**作为首个落地目标。

优先验证可靠性，不提前引入数据库或复杂分布式存储。

## 2. 必须保存的语义

一份可恢复会议至少必须保存：

- Meeting 身份；
- 当前使用的 Protocol 与版本；
- 当前 Meeting State；
- 参与者与逻辑角色；
- Visibility Mode；
- Event Log；
- Checkpoint；
- 已生成 Artifact 引用；
- Human Annotation 引用；
- Human Arbiter 已作出的关键决定。

具体字段名由 `meeting.schema.json` 冻结。

## 3. Event Log

所有能够改变会议正式状态的动作必须能够在 Event Log 中被识别。

目标是使系统可以回答：

- 当前为什么处于这个阶段；
- 哪些动作已经发生；
- 哪些动作尚未发生；
- 某份报告来自哪些先前事件。

## 4. Checkpoint

Checkpoint 是可恢复执行状态的明确节点。

Checkpoint 必须足以让 Runtime 在程序重新启动后恢复到正确会议状态，而不是仅恢复 UI 文本。

## 5. 恢复

恢复后必须保持：

- Protocol 版本一致；
- 已完成事件不重复；
- 当前阶段一致；
- 下一合法动作一致；
- Human Gate 状态一致。

若存档不完整或校验失败，必须显示错误，不得静默“尽量猜着恢复”。

## 6. Replay

Replay 按会议时间线/轮次展示历史事件。

Replay 的目标不是播放动画，而是能够定位：

- 某一轮；
- 某个 Agent 发言；
- 某次秘书汇总；
- 某个 Checkpoint；
- 某个 Artifact；
- 某次 Human Annotation；
- 某个 Human Arbiter 决策。

## 7. Git-like Branch

系统允许从历史 Checkpoint 或可分支节点创建新的会议分支。

分支用于回答：

> 如果从当时采用另一种决策/继续另一轮讨论，会得到什么结果？

分支必须保留与父历史的关系。

分支树的最终 UI 表现属于模块级待定。

## 8. 存档错误

Persistence 错误不得被当成普通会议成功结束。

系统必须能够向用户报告：

- 哪个存档失败；
- 失败阶段；
- 可定位错误；
- 当前内存状态是否仍可继续使用。

## 9. D1 验收闭环

```text
Load Protocol
→ Start Meeting
→ Mock Agent Events
→ Phase Advance
→ Event Log
→ Save Single JSON
→ Checkpoint
→ Close
→ Reopen
→ Restore
→ Continue
→ Finish
```

该闭环通过后，才进入真实模型 Transport。
