# Changelog — AI 顾问委员会 v0.1

> 格式参考 Keep a Changelog。所有变更按时间倒序。

## D1-R1-F1 — Protocol Registry 收口修复 — 2026-08-07

- 修复切换项目目录后旧 Schema Override 跨目录残留的问题（F01）。
- 增加 Schema Override Session 生命周期回归测试（TEST-13 / TEST-14 / TEST-15，自动测试 12 → 15 项）。
- 删除已废弃的 C# 探索实现（`AI-Council.slnx` / `src/` / `tests/`）与 `.gitignore` 中 `.NET` 段，正式仓库仅保留 HTML/CSS/JavaScript。
- 更新 `file-tree.md`，使导航统一指向 HTML/CSS/JavaScript 正式实现。
- 修正 D1-R1 报告中文件统计（22 个新增文件）与 Git 状态（cf13050 / ef3a257）。

## [Unreleased]

- （无）

## [0.1.0] — D1-R1 Protocol Registry (HTML/JS) — 2026-08-07

技术栈正式冻结为 **HTML / CSS / JavaScript**（纯浏览器，无服务器、无后端、无 CDN）。

### Added
- `app/`：纯浏览器本地应用，双击 `index.html` 即运行。
- **ProtocolLoader**：`File → 文本 → JSON.parse → Parsed Object`；损坏 JSON 产出 `JSON_PARSE_FAILED`，不崩溃。
- **SchemaValidator**：Ajv 8.20.0（Draft 2020-12）本地 IIFE 打包 `vendor/ajv2020.bundle.js`，加载正式 `protocol.schema.json` 零副本校验；全部错误均收集。
- **ProtocolRegistry**：`Available` / `Invalid`(Quarantine) 分流；坏规则不进 Available 也不静默消失。
- **重复检测**：`protocol_id + version` 唯一；冲突双方均隔离并产出 `DUPLICATE_PROTOCOL`，不依赖文件顺序、不覆盖。
- **Session 冻结（第42题）**：用户选目录后建立 File Snapshot，`Object.freeze()` 注册表，无轮询 / watcher / 定时器 / 自动刷新。
- **坏规则隔离（第43题）**：UI 明确显示文件 / ID / 版本 / 错误码 / JSON Path / 消息。
- 测试：`app/tests/` 下的 JavaScript 自动测试（D1-R1 为 12 项，D1-R1-F1 增至 15 项；Node 命令行 15/15，Chrome/Edge 真机各 10/10）。

### Frozen
- 禁用：C# / .NET / WPF / Avalonia / Java / Python 后端 / Node 后端 / Electron / Tauri / 数据库服务器。
- 正式 `protocol.schema.json` **未修改**。
- 未实现 D1-R2 及之后阶段功能（见下）。

### Not in scope (D1-R1)
- D1-R2 Protocol Semantic Validator（Phase 可达性、Transition target、Human Gate、$end 可达性、Side/Role 数量语义）等。

## [0.1.0-pre] — Phase 0 规范冻结

### Added
- `docs/`：Council 宪法、Protocol 组成、执行协议等 12 篇冻结文档。
- `schema/`：Schema v0.1（`protocol` / `role` / `meeting` / `message` / `artifact` / `annotation`）+ `valid` / `invalid` 示例集 + SHA256 清单。
- `protocols/committee-mvp/protocol.json`：首个示例协议。

### Changed
- 早期以 C#（`.slnx` / `src/` / `tests/`）做技术验证，后路线冻结为 HTML/JS；C# 代码保留为历史参考，不参与 D1-R1 运行。
