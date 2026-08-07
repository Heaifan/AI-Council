# AI顾问委员会宪章 v0.1

> 状态：Phase 0 制度冻结版  
> 适用范围：AI顾问委员会 v0.1  
> 原则：本文件只冻结一级制度与边界；评分公式、UI布局、JSON字段名等模块级问题不在本文件提前锁死。

## 1. 系统定位

AI顾问委员会不是“多人聊天 UI”，而是一套由**人类最终裁定、协议驱动、可验证、可恢复、可回放**的多智能体议事系统。

核心链路：

```text
Human Arbiter
老板 / 最终裁定者
        │
        ▼
Meeting Runtime
确定性推进会议
        │
        ▼
Protocol Engine
读取并执行议事规则
        │
        ▼
Instruction Compiler
当前状态 → 当前 Agent 指令
        │
        ▼
Model Transport
API / LOCAL / WEB_RELAY / WEB_AUTOMATION
        │
        ▼
Agents + Secretary
```

外围能力：

```text
Protocol Validator
Meeting Persistence
Replay / Checkpoint
Git-like Branch
Artifact
Human Annotation
Knowledge Base
Model Registry
```

## 2. 权力边界

### 2.1 Human Arbiter

Human Arbiter 是会议的最终裁定者。

系统、主席、秘书、委员、评分器与模型均不得替代 Human Arbiter 作最终制度性决定。

Human Arbiter 至少拥有以下权力：

- 启动、暂停、继续或结束会议；
- 在协议允许的节点决定是否继续讨论或追加 Battle；
- 对会议结论作最终接受、拒绝或保留；
- 对正式议事规则的新增或修改作最终批准；
- 对关键会议结果施加 Human Seal。

### 2.2 Meeting Runtime

Meeting Runtime 负责**确定性推进会议**，不负责自由发挥会议程序。

Runtime 必须依据当前：

- Protocol；
- Meeting State；
- 已完成事件；
- Human Arbiter 输入；

决定下一步允许发生的动作。

禁止由某个模型在运行时临时改写正式会议流程。

### 2.3 Protocol Engine

Protocol Engine 负责读取和执行正式议事规则。

正式规则以机器可校验协议表示；v0.1 以 JSON 规则为主。

协议的具体字段名称由 `protocol.schema.json` 在 Schema 阶段冻结，本宪章只冻结语义要求。

### 2.4 Instruction Compiler

Instruction Compiler 将：

```text
Protocol
+ Role
+ State
+ Visibility
+ Context
```

编译为当前 Agent 的 `InstructionPacket` 与最终 Prompt。

每个 Agent 实际收到的编译结果必须可审计、可展示，禁止存在不可追踪的隐式提示拼接。

### 2.5 Model Transport

模型调用与会议制度解耦。

同一 Agent/Role 不应与某一个具体模型供应商绑定。

正式 Transport 类型：

- `API`
- `LOCAL`
- `WEB_RELAY`
- `WEB_AUTOMATION`

v0.1 MVP 优先实现 `WEB_RELAY`；其他 Transport 后续扩展。

## 3. 角色与模型分离

角色是会议职责，模型是执行该职责的计算资源，两者必须分离。

角色来源支持：

- 角色原型库；
- AI 根据会议议题动态生成角色。

角色分配必须由系统随机完成，不由主席 AI 主观指派。

Agent 始终必须知道自己的：

- 角色卡；
- 阵营任务；
- 当前会议阶段允许做什么。

但其他参与者能看到多少信息，由会议 Visibility Mode 决定。

## 4. 可见性与匿名

系统支持三种会议可见性模式：

| 模式 | 阵营 | 角色 | 底层模型 |
|---|---|---|---|
| 公开模式 | 公开 | 公开 | 公开 |
| 半匿名模式 | 公开 | 公开 | 隐藏 |
| 完全匿名模式 | 仅显示 A/B | 隐藏 | 隐藏 |

完全匿名模式下，对外可以只显示：

```text
A1 A2 A3
VS
B1 B2 B3
```

Agent 自身仍必须知道自己的真实角色卡和阵营任务。

v0.1 默认采用**半匿名模式**，以减少具体模型品牌/声望对讨论的影响，同时保留角色责任可辨识性。

## 5. 主席与秘书

主席承担会议程序协调职责；秘书承担记录、结构化提取、汇总与归档职责。

在当前设计中允许由同一个 AI 实例承担“主席 + 秘书”职能，但必须遵守以下边界：

- 对各方观点保持中立；
- 不因模型身份、阵营或表达风格给予额外权重；
- 汇总必须区分“原观点”“秘书归纳”“最终裁定”；
- 不得把秘书自己的推断伪装成委员原话；
- 关键结论必须可追溯到对应发言、证据或事件；
- 最终决策权始终属于 Human Arbiter。

## 6. 协议治理

### 6.1 议事规则推荐

采用：

> **LLM 推荐 + 系统规则校验**

LLM 负责理解用户自然语言中的会议意图、目标和问题类型，并从已安装 Protocol 中生成结构化会议 Recipe。

系统随后执行确定性规则校验。

LLM 推荐不是正式执行授权；只有通过系统校验的 Recipe 才能进入 Runtime。

### 6.2 新增与修改 Protocol

同时支持：

1. 手工编辑 JSON；
2. AI 根据自然语言生成。

AI 生成的规则必须依次经过：

```text
Schema 校验
→ Protocol Validator / 语义冲突检查
→ 可视化流程展示
→ Human Arbiter 批准
→ 写入正式规则库
```

高级模式允许查看原始协议 JSON。

### 6.3 禁止热加载

Protocol 不支持热加载。

新增或修改规则文件后，必须重启程序才能被正式识别和加载。

正在运行中的会议不受磁盘上规则文件变化影响。

### 6.4 单 Protocol 加载失败隔离

单个 Protocol 加载失败不得阻止整个程序启动。

坏规则必须被隔离，并在 UI 中明确显示：

- 规则名称/文件；
- 规则版本；
- 具体校验错误。

禁止静默忽略。

## 7. 持久化、恢复与审计

会议必须具备：

- Meeting State；
- Event Log；
- 单 JSON 持久化；
- Checkpoint；
- 恢复；
- Replay；
- Git-like Branch；
- Artifact；
- Human Annotation。

v0.1 的首要可靠性目标是：

> 一场使用 Mock Agent 的会议可以严格按 JSON Protocol 跑完，并且程序中途关闭后可以从持久化状态恢复。

## 8. 设计冻结边界

以下内容属于模块级设计问题，**不构成 v0.1 一级架构阻塞项**：

- 评分公式；
- Agent 超时与重试次数；
- UI 最终布局；
- Obsidian 导出模板；
- Protocol JSON 具体字段名称；
- Protocol 推荐器具体使用哪个模型；
- WEB_RELAY 交互细节；
- Artifact 具体类型全集；
- 分支树最终可视化方式。

这些问题允许在对应模块开发前继续冻结，但不得反向破坏本宪章已经确定的一级边界。

## 9. v0.1 实施原则

开发顺序：

1. Protocol Kernel；
2. Instruction Compiler；
3. WEB_RELAY 单模型闭环；
4. 多 Agent / 两阵营；
5. Replay / Branch / Artifact / Annotation；
6. Transport 扩展。

第一轮不得同时接入多个真实模型供应商，也不得以 UI 完整度替代 Protocol Kernel 的可靠性验证。
