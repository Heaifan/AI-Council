# File Tree — AI 顾问委员会 v0.1

> 最后更新：2026-08-07（D2-R1 更新）
> 技术栈已冻结：**HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。
> 早期 C# 探索实现（`.slnx` / `src/` / `tests/`）已在 D1-R1-F1 从正式工作树删除，历史保留于 Git；正式实现为纯浏览器 HTML/CSS/JS，无构建产物。

## 顶层

```text
AI-Council/
├── docs/                      # Phase 0 冻结文档（12 篇）
├── schema/                    # Schema v0.1 正式定义 + 示例
├── roles/                     # D2-R1 Role Card 库（符合 role.schema.json）
├── protocols/                 # 用户协议目录（运行时由浏览器选择）
├── app/                       # ★ D1-R1/R2/R3/R4 正式实现（纯 HTML/JS）
├── reports/                   # 开发报告 + 真机验收截图
├── file-tree.md               # 本文件
├── changelog.md
└── .gitignore
```

## app/（D1-R1 / D1-R2 / D1-R3 / D1-R4 正式实现，核心目录）

```text
app/
├── index.html                 # 双击即运行入口（Developer Harness）
├── css/
│   └── app.css                # 浅色简洁样式
├── js/
│   ├── app.js                 # 启动编排：选目录 → 建 Snapshot → 初始化 Session
│   ├── protocol-loader.js        # File → 文本 → JSON.parse → Parsed Object
│   ├── protocol-schema-validator.js  # Ajv 2020 封装，加载正式 Schema
│   ├── protocol-semantic-validator.js  # D1-R2 确定性语义校验（可达性/Human Gate/Side/Role）
│   ├── protocol-registry.js         # Available / Invalid 分流 + 重复检测
│   ├── protocol-diagnostic.js       # 统一诊断结构（含 RUNTIME_* 码）
│   ├── protocol-file-source.js      # File 快照 + protocols/**/protocol.json 发现
│   ├── protocol-session.js          # Session 冻结（第42题：无热加载）
│   ├── meeting-state.js             # D1-R3 Meeting 状态模型 + 错误模型
│   ├── meeting-action.js            # D1-R3 Pending Action 构造
│   ├── meeting-factory.js           # D1-R3 从 Available Protocol 创建 Meeting
│   ├── meeting-runtime.js           # D1-R3 核心确定性引擎（start/drive/transition）+ R4 事件/检查点埋点
│   ├── meeting-event-log.js         # ★D1-R4 Append-only Event Log（seq 0..N-1，可注入时钟）
│   ├── meeting-checkpoint.js        # ★D1-R4 Checkpoint 深拷贝快照（挂 checkpoint_created 事件）
│   ├── protocol-fingerprint.js      # ★D1-R4 Canonical JSON + Web Crypto SHA-256 协议指纹
│   ├── meeting-archive.js           # ★D1-R4 Runtime Meeting → meeting.schema 存档 DTO
│   ├── meeting-schema-validator.js  # ★D1-R4 单 Ajv 实例 + $ref Schema Pack（meeting/role/message/artifact/annotation）
│   ├── meeting-restore-validator.js # ★D1-R4 恢复语义校验（协议存在/指纹一致/事件/检查点/状态一致性）
│   ├── meeting-persistence.js       # ★D1-R4 序列化 + 浏览器 Save/Load（Blob 下载 / file input）
│   ├── meeting-restore.js           # ★D1-R4 存档 → Runtime Meeting 原子恢复（绝不重新 start）
│   ├── meeting-persistence-ui.js    # ★D1-R4 浏览器持久化面板（仅浏览器，不进 Node 测试）
│   ├── role-card-registry.js       # ★D2-R1 Role Card 装载 / 按 role_class 确定性解析（补 §24-1 缺口）
│   ├── instruction-packet-schema.js # ★D2-R1 InstructionPacket Schema 校验器（Ajv2020）
│   ├── instruction-compiler.js      # ★D2-R1 确定性 (Protocol,Meeting,Phase,Participant)→InstructionPacket
│   ├── mock-agent-runtime.js        # D1-R3 测试用 Mock Agent 推进
│   └── ui/
│       ├── dom.js               # 轻量 DOM 工具
│       ├── diagnostic-view.js   # 坏规则诊断渲染
│       └── registry-view.js     # Available / Invalid 列表渲染
├── vendor/
│   └── ajv2020.bundle.js       # Ajv 8.20.0 (Draft 2020-12) IIFE 本地打包
└── tests/
    ├── test-runner.html        # 浏览器内测试页（无服务器）
    ├── test-runner.js          # 测试运行器
    ├── run-node.js             # Node 入口（自动测试）
    ├── run-browser.js          # Playwright 真机验收入口
    ├── protocol-test-suite.js  # 测试框架
    ├── protocol-test-fixtures.js
    ├── protocol-test-cases.js  # TEST-01..07, 11, 12（Loader/Schema/Registry）
    ├── protocol-test-cases-session.js  # TEST-08..10, 13..15（冻结/Schema Override）
    ├── protocol-test-cases-semantic.js  # TEST-16..31（D1-R2 语义校验）
    ├── protocol-test-cases-runtime.js   # TEST-32..53（D1-R3 会议运行时）
    ├── protocol-test-cases-persistence.js  # ★TEST-54..84（D1-R4 事件/检查点/指纹/存档/恢复）
    ├── protocol-test-cases-compiler.js    # ★TEST-85..109（D2-R1 Instruction Compiler / Role Card）
    ├── source-bundle.js        # 被测模块聚合（浏览器/Node 共用）
    └── fixtures/acceptance/protocols/   # 人工验收样例
        ├── good-a/ good-c/      broken-b/  missing-version/
        └── dup-x/ dup-y/        # 各含 protocol.json
```

## schema/（正式 Schema，优先级高于个人判断）

```text
schema/
├── schemas/
│   ├── protocol.schema.json    # ★ D1-R1 校验依据（未修改）
│   ├── meeting.schema.json     # ★ D1-R4 存档校验依据（未修改）
│   ├── role.schema.json  message.schema.json      # D1-R4 作为 $ref Schema Pack 注册
│   ├── artifact.schema.json  annotation.schema.json
│   ├── instruction-packet.schema.json # ★ D2-R1 新增（编译产物校验；非冻结 6 份之一）
├── examples/                   # valid-* / invalid-* 示例集
├── reports/                    # Schema-Field-Freeze.md 等
├── tools/validate_schemas.py
├── manifest.sha256.json
└── README.md
```

## docs/（Phase 0 冻结文档）

```text
docs/
├── Council-Constitution.md
├── Protocol-Composition.md
├── Procedure-Execution-Protocol.md
├── Communication-Protocol.md
├── Role-Card-Spec.md
├── Decision-Report-Spec.md
├── Human-Annotation-Spec.md
├── Knowledge-Export-Spec.md
├── Meeting-Persistence-Spec.md
├── Model-Transport-Spec.md
├── Phase-0-Freeze-Register.md
└── Phase-0-Package-README.md
```

## 技术栈

正式实现已冻结为纯浏览器 **HTML / CSS / JavaScript**，无服务器、无后端、无 CDN、无构建产物。早期 C# 探索实现（`.slnx` / `src/` / `tests/`）已在 D1-R1-F1 从工作树删除，仅保留于 Git 历史，不作为正式运行代码；当前运行代码仅为 `app/`。
