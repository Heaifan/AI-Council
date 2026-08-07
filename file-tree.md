# File Tree — AI 顾问委员会 v0.1

> 最后更新：2026-08-07
> 技术栈已冻结：**HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。
> 构建产物（`bin/`、`obj/`、`.dll`、`.pdb`、`.cache`）已被 `.gitignore` 忽略，未计入跟踪文件。

## 顶层

```text
AI-Council/
├── AI-Council.slnx            # 解决方案文件（C# 探索遗留，非 D1-R1 范围）
├── docs/                      # Phase 0 冻结文档（12 篇）
├── schema/                    # Schema v0.1 正式定义 + 示例
├── protocols/                 # 用户协议目录（运行时由浏览器选择）
├── src/                       # 遗留 C# 探索（技术栈已改 HTML/JS，保留参考）
├── tests/                     # 遗留 C# 测试（同上）
├── app/                       # ★ D1-R1 正式实现（纯 HTML/JS）
├── reports/                   # 开发报告 + 真机验收截图
├── file-tree.md               # 本文件
└── changelog.md
```

## app/（D1-R1 正式实现，核心目录）

```text
app/
├── index.html                 # 双击即运行入口（Developer Harness）
├── css/
│   └── app.css                # 浅色简洁样式
├── js/
│   ├── app.js                 # 启动编排：选目录 → 建 Snapshot → 初始化 Session
│   ├── protocol-loader.js        # File → 文本 → JSON.parse → Parsed Object
│   ├── protocol-schema-validator.js  # Ajv 2020 封装，加载正式 Schema
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
    ├── protocol-test-cases.js  # TEST-01..07, 11, 12
    ├── protocol-test-cases-session.js  # TEST-08..10（无热加载）
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

## src/ 与 tests/（遗留 C# 探索，非 D1-R1 范围）

技术栈已冻结为 HTML/JS，以下 C# 代码仅作历史参考，不参与 D1-R1 运行。

```text
src/Council.Protocol/{Diagnostics,Loading,Registry,Validation}/*.cs
src/Council.Cli/*.cs
tests/Council.Protocol.Tests/*.cs
```
