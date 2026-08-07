# File Tree — AI 顾问委员会 v0.1

> 最后更新：2026-08-07（D1-R2 更新）
> 技术栈已冻结：**HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。
> 早期 C# 探索实现（`.slnx` / `src/` / `tests/`）已在 D1-R1-F1 从正式工作树删除，历史保留于 Git；正式实现为纯浏览器 HTML/CSS/JS，无构建产物。

## 顶层

```text
AI-Council/
├── docs/                      # Phase 0 冻结文档（12 篇）
├── schema/                    # Schema v0.1 正式定义 + 示例
├── protocols/                 # 用户协议目录（运行时由浏览器选择）
├── app/                       # ★ D1-R1/D1-R2 正式实现（纯 HTML/JS）
├── reports/                   # 开发报告 + 真机验收截图
├── file-tree.md               # 本文件
├── changelog.md
└── .gitignore
```

## app/（D1-R1 / D1-R2 正式实现，核心目录）

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
│   ├── protocol-diagnostic.js       # 统一诊断结构
│   ├── protocol-file-source.js      # File 快照 + protocols/**/protocol.json 发现
│   ├── protocol-session.js          # Session 冻结（第42题：无热加载）
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
│   ├── role.schema.json  meeting.schema.json
│   ├── message.schema.json  artifact.schema.json  annotation.schema.json
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
