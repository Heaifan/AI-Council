# Procedure Execution Protocol v0.1

> 状态：Phase 0 制度冻结版  
> 目标：定义 Meeting Runtime 如何依照 Protocol 推进会议。

## 1. 核心原则

会议流程由 Protocol 定义，由 Runtime 执行。

```text
Protocol ≠ Prompt
Protocol = 可验证的会议程序
Prompt = 当前状态下编译给某个 Agent 的一次指令
```

Runtime 不能让某个 LLM 自由决定下一阶段是什么。

## 2. Runtime 输入

每次推进至少依赖：

```text
Active Protocol
Current Meeting State
Completed Events
Pending Actions
Human Arbiter Decision
Checkpoint / Recovery State
```

## 3. Runtime 输出

一次合法推进只能产生 Protocol 允许的下一类动作，例如：

- 请求指定 Agent 发言；
- 请求 Secretary 汇总；
- 进入全员 Critique；
- 选择/确认 Battle 参与者；
- 等待 Human Arbiter；
- 创建 Checkpoint；
- 结束并归档会议。

具体动作枚举在 Schema / Kernel 阶段冻结。

## 4. 参考会议 Recipe

当前委员会产品方向中的参考流程为：

```text
Round 1  各代表独立主动发言
Round 2  主席/秘书汇总
Round 3  汇总发送给全员进行漏洞审查/挑刺
Round 4  代表 Battle
Round 5  主席形成中立决策报告
Human Arbiter 决定：结束 / 继续会议 / 追加 Battle
Archive  归档
```

其中 Battle 设计允许主席依据协议从双方候选中组织代表攻防。

**注意：上述流程是首批内置 Recipe 的参考，不是宪章强制所有 Protocol 都必须采用同一轮次。**

## 5. Human Gate

凡 Protocol 定义为 Human Gate 的节点，Runtime 必须停在明确等待状态，直到 Human Arbiter 输入有效指令。

禁止用超时或模型猜测自动代替人类裁定。

## 6. Determinism

对同一：

- Protocol 版本；
- Meeting State；
- 已记录事件；
- Human 输入；

Runtime 的“允许下一步是什么”应当保持确定。

模型内容本身可以不确定，但**程序推进规则必须确定**。

## 7. Checkpoint 与恢复

Runtime 必须支持在有效节点创建 Checkpoint。

恢复后：

- 已完成事件不得被当作未完成重新执行；
- 当前阶段必须可重建；
- 下一合法动作必须与恢复前一致；
- 当前使用的 Protocol 版本必须保持会议内一致。

## 8. 运行中 Protocol 稳定性

正式加载后的 Protocol 在当前程序生命周期中不热更新。

磁盘文件变化不得改变一场已经开始的会议。

## 9. 异常状态

至少需要能区分：

- Protocol 加载异常；
- Protocol 执行异常；
- Agent 输出校验异常；
- Transport 异常；
- Persistence 异常；
- 等待 Human Arbiter。

错误状态不得伪装成正常会议结束。

## 10. MVP 验证

D1 的第一条端到端验收标准：

> 使用 Mock Agent，加载一个合法 JSON Protocol，从初始状态推进到结束；过程中生成 Event Log 与 Checkpoint；关闭并重新启动后可以从单 JSON 存档恢复并继续完成会议。
