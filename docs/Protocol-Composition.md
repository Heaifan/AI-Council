# Protocol Composition v0.1

> 状态：Phase 0 制度冻结版  
> 目标：规定议事规则如何被创建、推荐、验证、批准、加载与组合。

## 1. Protocol 的地位

Protocol 是会议程序的机器可执行定义。

它负责描述“会议如何进行”，而不是描述某个具体模型“应该相信什么结论”。

## 2. Protocol 来源

系统支持：

- 内置 Protocol；
- 用户手工编辑的 JSON Protocol；
- AI 根据自然语言生成的候选 Protocol。

## 3. 首批规则库目录

规划目录：

```text
protocols/
├── robert/
├── holacracy/
├── delphi/
├── brainstorming/
├── six-thinking-hats/
├── aar/
├── red-team/
├── wargaming/
├── commander-update/
└── ics/
```

v0.1 第一阶段不要求十套规则全部实现。

## 4. 规则推荐

规则推荐采用：

> **LLM 推荐 + 系统规则校验**

LLM 负责：

- 理解用户会议意图；
- 识别目标与问题类型；
- 从已安装 Protocol 中提出候选；
- 生成结构化 Meeting Recipe。

系统负责：

- 检查 Protocol 是否存在且可用；
- 检查 Recipe 是否符合 Schema；
- 检查程序约束；
- 拒绝非法组合。

最终是否启动会议仍由用户/Human Arbiter 决定。

## 5. AI 生成 Protocol

AI 根据自然语言生成规则时，候选规则不能直接写入正式规则库。

正式流程：

```text
Natural Language
↓
AI Candidate Protocol
↓
Schema Validation
↓
Protocol Validator
↓
Semantic Conflict Check
↓
Visual Flow Preview
↓
Human Arbiter Approval
↓
Formal Protocol Library
```

高级模式允许查看和编辑原始 JSON。

## 6. Validator

Protocol Validator 至少承担两类责任：

### 结构校验

由 Schema 完成：

- 必需结构是否存在；
- 类型是否合法；
- 引用是否可解析；
- 版本是否可识别。

### 语义/流程校验

由 Validator 完成：

- 是否存在不可达阶段；
- 是否存在无合法出口的阶段；
- Human Gate 是否有明确等待/继续路径；
- 是否引用不存在的角色/动作/阶段；
- 组合后的规则是否发生语义冲突。

具体规则集在 D1 前冻结。

## 7. 加载策略

### 不热加载

新增/修改 Protocol 后必须重启程序才能正式加载。

### 单规则隔离

一个 Protocol 加载失败：

- 不阻止应用启动；
- 该规则进入隔离状态；
- 其他合法规则继续可用；
- UI 必须显示规则文件、版本和具体校验错误；
- 禁止静默跳过。

## 8. 版本稳定性

一场会议启动后，应记录其实际使用的 Protocol 标识与版本。

会议恢复、回放和分支必须能够识别原会议使用的规则版本。

具体版本字段与兼容策略在 Schema/Persistence 阶段冻结。

## 9. Composition 边界

Protocol 可以形成 Recipe，但 v0.1 不在宪章层预设复杂 DSL。

优先原则：

> 先证明少量简单 Protocol 可以被可靠加载、验证、执行和恢复，再扩展组合表达能力。
