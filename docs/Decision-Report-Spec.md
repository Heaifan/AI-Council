# Decision Report Specification v0.1

> 状态：Phase 0 制度冻结版  
> 目标：规定秘书/主席如何产出中立、可追溯、供 Human Arbiter 裁定的会议报告。

## 1. 报告性质

Decision Report 是**决策输入**，不是最终裁决本身。

最终裁决由 Human Arbiter 作出。

## 2. 中立性

报告必须同时保留：

- 支持方核心观点；
- 反对方核心观点；
- 关键证据；
- 主要风险；
- 未解决冲突；
- 仍不确定的信息；
- Battle 后发生变化的观点或争点。

禁止通过摘要删除“对结论不方便”的有效反方信息。

## 3. 可追溯性

报告中的重要结论应能追溯到：

- 原始 Agent 发言；
- Secretary 汇总事件；
- Artifact；
- Human Annotation；
- 会议阶段。

最终字段形式在 Schema 阶段确定。

## 4. 主席意见与事实分离

如果主席需要给出程序性建议或综合判断，必须与以下内容分离显示：

```text
原始事实/证据
委员观点
秘书归纳
主席综合判断
Human Arbiter 最终裁定
```

不得混写。

## 5. 评分

系统允许存在评分、排名或 Battle 候选选择机制，但**评分公式尚属模块级待定**。

v0.1 文档不得假装已经冻结一个统一评分算法。

## 6. Human Seal

Human Arbiter 可以对最终报告施加 Human Seal，用来表示该版本已经过人类最终确认。

Human Seal 的签名字段、权限与防篡改方式在 Persistence/Schema 阶段进一步冻结。

## 7. 报告可回放

Decision Report 不应只保存最终摘要。

Replay 必须能够回到形成该报告的原始阶段与事件，查看“为什么会得出这份报告”。

## 8. 输出用途

Decision Report 后续可作为：

- 人类决策依据；
- Knowledge Base 条目；
- Artifact；
- 分支起点；
- 外部知识导出来源。

具体导出模板后续冻结。
