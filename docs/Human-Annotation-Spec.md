# Human Annotation Specification v0.1

> 状态：Phase 0 制度冻结版  
> 目标：允许 Human Arbiter 在不破坏原始会议证据的前提下增加人类判断层。

## 1. Annotation 的地位

Human Annotation 是附加在人类可见会议历史、消息、Artifact 或报告上的人工解释/标记。

它不是对原始 Agent 输出的无痕改写。

## 2. 基本能力

v0.1 方向包括：

- Highlight；
- Annotation；
- Human Seal。

具体 UI 交互后续确定。

## 3. 可追溯性

Annotation 必须能够指向明确目标，例如：

- Message；
- Event；
- Artifact；
- Decision Report；
- Checkpoint。

不得只保留一段脱离上下文的批注文本。

## 4. 原文与批注分离

原始会议记录和人类批注必须在语义上分离。

用户修改自己的批注，不应改变原始 Agent 发言的历史含义。

## 5. Human Seal

Human Seal 表示 Human Arbiter 对某个正式输出版本作出最终确认。

Seal 不等于“系统认为内容客观正确”，它表示：

> 该版本已被人类最终裁定者接受为当前正式结果。

## 6. Replay 集成

Replay 时必须能够看到关键 Annotation 与 Seal 所处的历史位置。

## 7. 后续待定

以下属于模块级设计：

- 批注颜色与 UI；
- 是否支持多级标签；
- Seal 的签名/哈希实现；
- 批注权限模型；
- 外部导出格式。
