# Knowledge Export Specification v0.1

> 状态：Phase 0 制度冻结版  
> 目标：把一次会议中产生的可复用知识与完整会议运行状态分离。

## 1. Knowledge Base 的角色

Meeting Persistence 负责“会议如何发生”。

Knowledge Base 负责“哪些结果值得被后续复用”。

两者不能混为同一个存储概念。

## 2. 可进入知识层的内容

后续可以从会议中提取：

- Decision Report；
- 已确认结论；
- 未解决问题；
- Artifact；
- Human Annotation；
- Human Seal 后的正式结果；
- 可追溯证据引用。

## 3. Artifact

Artifact 是会议产生的结构化成果载体。

Artifact 的具体类型全集尚未冻结。

v0.1 只要求架构上允许：

- 由 Agent/Secretary 产生；
- 与会议事件关联；
- 被 Annotation；
- 被 Replay 定位；
- 被分支继承或引用；
- 被导出。

## 4. 导出原则

导出结果必须尽量保留来源关系，而不是只导出失去上下文的最终结论。

## 5. Obsidian

Obsidian 导出属于计划能力，但模板细节不作为当前架构阻塞项。

后续模块设计时再冻结：

- 文件命名；
- Frontmatter；
- 双链；
- 标签；
- 目录结构；
- Artifact 映射方式。

## 6. 非目标

Phase 0 不决定：

- 向量数据库；
- Embedding 模型；
- RAG 排序算法；
- 全自动长期记忆写入策略；
- Obsidian 最终模板。
