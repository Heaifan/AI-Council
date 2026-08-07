# AI顾问委员会 — Protocol Schema v0.1

本包包含 D1 Protocol Kernel 开工前的机器合同基线。

## 目录

```text
schemas/     6 个正式 JSON Schema
examples/    合法与非法样例
tools/       Schema + Protocol 语义验证脚本
reports/     字段冻结与验证报告
```

## 验证

```bash
python tools/validate_schemas.py
```

预期：

```text
RESULT: PASS
```

## 下一步

D1 Protocol Kernel：

```text
Load Protocol
→ Schema Validation
→ Protocol Semantic Validation
→ Meeting State
→ Deterministic Phase Advance
→ Event Log
→ Single JSON Save
→ Checkpoint
→ Restore
```
