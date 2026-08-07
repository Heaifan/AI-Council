# AI顾问委员会协议体系 v0.1 — Phase 0

本包是制度文档冻结版。

## 本轮完成

- 10 份正式 Markdown 制度/规格文档；
- 1 份 Phase 0 Freeze Register，用于追踪已冻结一级决定；
- 明确区分“一级架构冻结”与“模块设计待定”。

## 本轮没有做

- 没有冻结 JSON Schema 字段名；
- 没有开始 UI；
- 没有接真实 LLM；
- 没有假装实现全部十套 Protocol。

## 下一阶段

`Protocol Schema v0.1`

目标文件：

```text
schemas/
├── protocol.schema.json
├── meeting.schema.json
├── role.schema.json
├── message.schema.json
├── artifact.schema.json
└── annotation.schema.json
```

随后进入 `D1 Protocol Kernel`。
