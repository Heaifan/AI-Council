# Phase 0 Freeze Register

> 用途：记录当前已经可以可靠落库的一级冻结决定，以及仍属于模块设计的待定项。  
> 注意：本表不是对历史 1～43 题逐字转录；它是正式架构语义的追踪表。若后续找回完整访谈原文，可再补充 `source_question` 映射，而不改变已冻结语义。

## A. 已冻结一级决定

| ID | 决定 |
|---|---|
| F-001 | Human Arbiter 是最终裁定者。 |
| F-002 | Meeting Runtime 负责确定性推进会议。 |
| F-003 | 会议程序由 Protocol Engine 执行，不由 LLM 临时自由决定。 |
| F-004 | Instruction Compiler 将 Protocol + Role + State + Visibility + Context 编译为 InstructionPacket/Prompt。 |
| F-005 | 实际发送给 Agent 的 Prompt 必须可审计、可展示。 |
| F-006 | Model Transport 与 Protocol/Role 解耦。 |
| F-007 | Transport 规划为 API / LOCAL / WEB_RELAY / WEB_AUTOMATION。 |
| F-008 | D3 首先实现 WEB_RELAY。 |
| F-009 | D1 使用 Mock Agent，不接真实 LLM。 |
| F-010 | D1 必须证明会议可按 JSON Protocol 完整运行，并支持单 JSON 存档、Checkpoint、恢复。 |
| F-011 | 系统包含 Replay / Git-like Branch / Artifact / Human Annotation / Knowledge Base / Model Registry。 |
| F-012 | 角色来源支持原型库 + AI 动态生成。 |
| F-013 | 角色分配必须随机，不由主席 AI 主观指派。 |
| F-014 | 支持公开、半匿名、完全匿名三种 Visibility Mode。 |
| F-015 | 半匿名：阵营与角色公开，底层模型隐藏。 |
| F-016 | 完全匿名：其他参会者只看到 A1/A2/A3、B1/B2/B3 等代号，但 Agent 自己仍知道角色卡和阵营任务。 |
| F-017 | 主席/秘书必须保持中立，最终决定权不属于主席/秘书。 |
| F-018 | 规则推荐采用 LLM 推荐 + 系统规则校验。 |
| F-019 | Protocol 同时支持手工 JSON 编辑与 AI 自然语言生成。 |
| F-020 | AI 生成 Protocol 必须经过 Schema 校验 + Protocol Validator/语义冲突检查 + 可视化预览 + Human Arbiter 批准后才能进入正式规则库。 |
| F-021 | 高级模式允许查看原始 Protocol JSON。 |
| F-022 | Protocol 不支持热加载；新增/修改后必须重启才正式加载。 |
| F-023 | 运行中的会议不受磁盘规则文件变化影响。 |
| F-024 | 单个 Protocol 加载失败不阻止程序启动；坏规则隔离。 |
| F-025 | Protocol 异常必须在 UI 明确显示规则文件、版本与具体校验错误，禁止静默忽略。 |
| F-026 | 第一阶段不要求十套议事规则全部实现。 |
| F-027 | 开发顺序为 D1 Kernel → D2 Compiler → D3 WEB_RELAY → D4 多 Agent → D5 Replay/Branch/Artifact/Annotation → D6 Transport 扩展。 |

## B. 参考流程（属于首批 Recipe，不是所有 Protocol 的宪法硬编码）

```text
Round 1 独立陈述
Round 2 主席/秘书汇总
Round 3 全员漏洞审查
Round 4 代表 Battle
Round 5 主席形成中立报告
Human Arbiter：结束 / 继续 / 追加 Battle
Archive
```

## C. 已明确不是当前架构阻塞项

- 评分具体公式；
- Agent 超时/重试次数；
- UI 最终布局；
- Obsidian 导出模板；
- Protocol JSON 具体字段名称；
- 规则推荐器的具体模型；
- WEB_RELAY 交互细节；
- Artifact 类型全集；
- 分支树最终显示方式。

## D. Phase 0 完成判定

当以下文档完成首版并互相不冲突，即可进入 Schema v0.1：

- Council-Constitution.md
- Communication-Protocol.md
- Procedure-Execution-Protocol.md
- Protocol-Composition.md
- Role-Card-Spec.md
- Decision-Report-Spec.md
- Meeting-Persistence-Spec.md
- Human-Annotation-Spec.md
- Knowledge-Export-Spec.md
- Model-Transport-Spec.md
