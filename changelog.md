# Changelog — AI 顾问委员会 v0.1

> 格式参考 Keep a Changelog。所有变更按时间倒序。

## [Unreleased]

- 补建 `file-tree.md` 与 `changelog.md`（仓库导航与变更记录）。

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
- 测试：`tests/` 下 12 项自动测试（Node + 浏览器），Chrome 真机 10/10、Edge 真机 10/10。

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
