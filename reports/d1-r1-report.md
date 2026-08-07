# D1-R1 Protocol Registry 开发报告

> 生成时间：2026-08-07T18:33+08:00
> 技术栈：HTML / CSS / JavaScript（纯浏览器，无服务器，无后端）

---

## 1. 当前阶段

D1-R1（Protocol Loader + Schema Validator + Protocol Registry）。

## 2. TODO

| # | 任务 | 状态 |
|---|------|------|
| T01 | 检查当前项目目录 | ✅ 完成 |
| T02 | 阅读 Phase 0 文档 | ✅ 完成 |
| T03 | 阅读 Schema v0.1 | ✅ 完成 |
| T04 | 建立 HTML 项目骨架 | ✅ 完成 |
| T05 | 实现本地目录选择 | ✅ 完成 |
| T06 | 实现 Protocol 文件发现 | ✅ 完成 |
| T07 | 实现 JSON 解析 | ✅ 完成 |
| T08 | 实现 JSON Schema 校验 | ✅ 完成 |
| T09 | 实现 ProtocolDiagnostic | ✅ 完成 |
| T10 | 实现 ProtocolRegistry | ✅ 完成 |
| T11 | 实现坏 Protocol 隔离 | ✅ 完成 |
| T12 | 实现重复 Protocol 检测 | ✅ 完成 |
| T13 | 验证无热加载行为 | ✅ 完成 |
| T14 | 完成自动测试 | ✅ 完成 |
| T15 | 浏览器人工验收 | ✅ 完成 |
| T16 | 输出 D1-R1 开发报告 | ✅ 本文件 |

## 3. 技术栈

确认：

```text
HTML 5
CSS 3
JavaScript ES2019+
```

无 C#、无 .NET、无 WPF、无 Electron、无 Tauri、无 Node.js 运行时依赖、无数据库、无 CDN。

## 4. 目录结构

```text
app/
├── index.html                          ← 双击即运行入口
├── css/
│   └── app.css                         ← 浅色 Developer Harness 样式
├── js/
│   ├── app.js                          ← 主驱动：目录选择 → Session → 渲染
│   ├── protocol-diagnostic.js           ← 统一诊断数据结构
│   ├── protocol-file-source.js          ← File Snapshot（不可变）
│   ├── protocol-loader.js               ← File → JSON.parse → Parsed Object
│   ├── protocol-schema-validator.js     ← Ajv 2020 正式 Schema 校验
│   ├── protocol-registry.js             ← Available / Invalid 分流
│   ├── protocol-session.js              ← Session 初始化与冻结
│   └── ui/
│       ├── dom.js                       ← 最小 DOM 原语
│       ├── diagnostic-view.js            ← 诊断渲染
│       └── registry-view.js             ← Registry 渲染
├── vendor/
│   └── ajv2020.bundle.js                ← Ajv 8.20.0 IIFE 打包（125KB）
└── tests/
    ├── test-runner.html                 ← 浏览器测试页入口
    ├── test-runner.js                   ← 浏览器测试驱动
    ├── run-node.js                      ← Node 命令行测试入口（仅开发期）
    ├── run-browser.js                   ← Playwright 真机验收脚本（仅开发期）
    ├── protocol-test-suite.js           ← 测试骨架
    ├── protocol-test-fixtures.js         ← 测试夹具工厂
    ├── protocol-test-cases.js            ← 用例：Loader/Schema/Registry/Duplicate
    ├── protocol-test-cases-session.js    ← 用例：Session 冻结/静态审计
    ├── source-bundle.js                  ← 从用户选择采集正式文件
    └── fixtures/
        └── acceptance/
            └── protocols/               ← 人工验收样例（6 个子目录）
```

## 5. 新增/修改文件清单

| 文件 | 操作 | 行数 |
|------|------|------|
| `app/index.html` | 新增 | ~70 |
| `app/css/app.css` | 新增 | ~120 |
| `app/js/app.js` | 新增 | ~90 |
| `app/js/protocol-diagnostic.js` | 新增 | ~80 |
| `app/js/protocol-file-source.js` | 新增 | ~100 |
| `app/js/protocol-loader.js` | 新增 | ~80 |
| `app/js/protocol-schema-validator.js` | 新增 | ~110 |
| `app/js/protocol-registry.js` | 新增 | ~120 |
| `app/js/protocol-session.js` | 新增 | ~90 |
| `app/js/ui/dom.js` | 新增 | ~40 |
| `app/js/ui/diagnostic-view.js` | 新增 | ~60 |
| `app/js/ui/registry-view.js` | 新增 | ~130 |
| `app/vendor/ajv2020.bundle.js` | 新增（自动打包） | ~3500 行压缩 |
| `app/tests/test-runner.html` | 新增 | ~50 |
| `app/tests/test-runner.js` | 新增 | ~70 |
| `app/tests/run-node.js` | 新增 | ~55 |
| `app/tests/run-browser.js` | 新增 | ~95 |
| `app/tests/protocol-test-suite.js` | 新增 | ~65 |
| `app/tests/protocol-test-fixtures.js` | 新增 | ~75 |
| `app/tests/protocol-test-cases.js` | 新增 | ~180 |
| `app/tests/protocol-test-cases-session.js` | 新增 | ~85 |
| `app/tests/source-bundle.js` | 新增 | ~65 |
| **合计** | **19 个新文件** | |

## 6. Browser 本地文件读取方案

**方案 A（已采用）：Schema 来自用户选择的同一份磁盘文件。**

具体行为：
1. 用户选择项目目录 → 建立 File Snapshot（一次性读取全部 File.text()）
2. 在 Snapshot 中搜索 `schemas/protocol.schema.json`
3. 若恰好找到 1 个 → 自动使用（零副本，直接从用户选择的磁盘文件读取）
4. 若未找到或多个 → 显示诊断，提示用户用"指定正式 Schema"按钮手动选取
5. 手动选取的 Schema 同样来自磁盘文件，不维护第二套内容

**不使用 fetch()**：file:// 下安全限制不可靠；改用 `<input type="file">` 的 File API。
**不使用 ES Module**：保证 file:// 双击即可运行，无需服务器。

## 7. ProtocolLoader

职责边界严格限定为：File 文本 → JSON.parse() → Parsed Object。

失败处理：
- `FILE_READ_FAILED`：File.text() 异常
- `JSON_PARSE_FAILED`：JSON.parse() 异常（含错误信息）
- 失败时不崩溃，返回 `{ok:false}` 结构供 Registry 隔离

## 8. Schema Validator

- 引擎：**Ajv 8.20.0**（Draft 2020-12），通过 esbuild 打包为 IIFE 全局脚本
- 打包路径：`app/vendor/ajv2020.bundle.js`（125KB，MIT 许可）
- 配置：`allErrors:true, strict:false, validateFormats:false`
- 不使用 CDN，不手写 if 判断冒充校验
- Schema 内容与正式 `schema/schemas/protocol.schema.json` 保持一致（零副本）
- Ajv 错误翻译为 ProtocolDiagnostic：instancePath → JSON Path，保留 keyword/schemaPath/params

## 9. ProtocolRegistry

分流结构：

```javascript
{
  available: [{ protocolId, version, name, filePath, document }], // 冻结文档
  invalid: [{ filePath, protocolId, version, name, diagnostics }],
  diagnostics: [...],
  counts: { available, invalid, diagnostics }
}
```

排序规则：available 按 (protocolId, version) 字典序；invalid 按 filePath 字典序。

## 10. Quarantine / Diagnostic

第43题实现确认：
- 坏规则进入 Invalid Protocols (Quarantine) 区域
- UI 展开显示完整六项信息：File / Protocol ID / Version / Error Code / JSON Path / Message
- 一个坏规则不影响其他规则（TEST-03 / TEST-05 通过）
- 错误不被静默忽略（所有诊断均进入 diagnostics[]）

诊断代码全集：

| 代码 | 严重度 | 触发条件 |
|------|--------|----------|
| FILE_READ_FAILED | error | File.text() 异常 |
| JSON_PARSE_FAILED | error | JSON.parse() 异常 |
| SCHEMA_VALIDATION_FAILED | error | Ajv 校验不通过 |
| UNSUPPORTED_SCHEMA_VERSION | error | schema_version ≠ "0.1.0" |
| DUPLICATE_PROTOCOL | error | protocol_id+version 冲突 |
| SCHEMA_SOURCE_MISSING | warning | 未发现 schema 文件 |
| SCHEMA_SOURCE_AMBIGUOUS | error | 发现多个 schema 文件 |
| SCHEMA_COMPILE_FAILED | error | Schema 编译异常 |
| NO_PROTOCOL_FILE_FOUND | warning | 未发现任何 protocol.json |

## 11. Duplicate 检测

- key = `protocol_id@version`
- 冲突双方都不得进入 Available
- 结果不依赖浏览器返回的文件顺序（TEST-06 双向验证通过）
- 冲突详情包含双方文件路径列表

## 12. 不热加载证明（第42题）

代码级证明：
- 无 `setInterval` / `setTimeout` / `requestAnimationFrame`
- 无 `XMLHttpRequest` / `fetch()` / `WebSocket` / `EventSource`
- 无 `FileSystemObserver` / `serviceWorker`
- Session 对象在初始化后立即 `Object.freeze()`
- Snapshot 条目在读取后立即冻结
- Registry 内的 Protocol 文档深度冻结

测试级证明：
- TEST-08：修改内存中的文本引用后，已初始化的 Registry 不变
- TEST-09：重新初始化整个 Session 才能读取新内容
- 浏览器真机验收：修改磁盘文件后等待 2 秒，Registry 数量不变

## 13. 自动测试结果

### Node 命令行（run-node.js）

```
总计 12 · 通过 12 · 失败 0
```

| 测试 | 名称 | 结果 |
|------|------|------|
| TEST-01 | 一个合法 Protocol → Available=1 / Invalid=0 | PASS |
| TEST-02 | 两个合法 Protocol → Available=2 / Invalid=0 | PASS |
| TEST-03 | 损坏 JSON → JSON_PARSE_FAILED | PASS |
| TEST-04 | invalid-protocol-schema.json → SCHEMA_VALIDATION_FAILED | PASS |
| TEST-05 | 两个合法 + 一个坏规则 → Available=2 / Invalid=1 | PASS |
| TEST-06 | 重复 protocol_id + version → DUPLICATE_PROTOCOL | PASS |
| TEST-07 | Schema 多错误必须全部保存 | PASS |
| TEST-08 | 修改磁盘后 Registry 不变 | PASS |
| TEST-09 | 重新初始化 Session 后才读新内容 | PASS |
| TEST-10 | 纯本地静态审计（无网络/轮询/CDN） | PASS |
| TEST-11 | 语义非法示例在 D1-R1 通过 Schema 层 | PASS |
| TEST-12 | 不支持的 schema_version → UNSUPPORTED_SCHEMA_VERSION | PASS |

### Chrome 真机（Playwright）

```
总计 10 · 通过 10 · 失败 0
```

### Edge 真机（Playwright）

```
总计 10 · 通过 10 · 失败 0
```

### 截图

保存在 `reports/d1-r1-screenshots/`（6 张 PNG）：
- `chrome-01-repo-root.png` — 仓库根目录，Available 1
- `chrome-02-quarantine.png` — 样例目录，Available 2 / Invalid 4，Quarantine 展开
- `chrome-03-tests.png` — 测试页 12/12
- `msedge-01-repo-root.png` / `msedge-02-quarantine.png` / `msedge-03-tests.png` — Edge 对应截图

## 14. Chrome 真机验收

✅ 10/10 全部通过。详见 §13 截图。

## 15. Edge 真机验收

✅ 10/10 全部通过。详见 §13 截图。

## 16. 是否修改正式 Schema

**NO**

正式 `schema/schemas/protocol.schema.json` 未做任何改动。Schema 内容全程以只读方式从磁盘文件读取并传入 Ajv 编译器。

## 17. 是否存在 D1-R1 范围外实现

**NO**

范围外功能检查清单：

| 禁止项 | 状态 |
|--------|------|
| Meeting Runtime | ❌ 未实现 |
| Meeting State Machine | ❌ 未实现 |
| Mock Agent | ❌ 未实现 |
| 6 Agent | ❌ 未实现 |
| Battle | ❌ 未实现 |
| Instruction Compiler | ❌ 未实现 |
| Prompt | ❌ 未实现 |
| ChatGPT / Gemini / DeepSeek / Kimi | ❌ 未实现 |
| API Transport | ❌ 未实现 |
| WEB_RELAY / WEB_AUTOMATION | ❌ 未实现 |
| Replay / Branch / Checkpoint | ❌ 未实现 |
| Persistence | ❌ 未实现 |
| Artifact Runtime | ❌ 未实现 |
| Annotation Runtime | ❌ 未实现 |
| Knowledge Base | ❌ 未实现 |
| 正式会议 UI | ❌ 未实现 |
| Phase 可达性语义检查（D1-R2） | ❌ 未实现 |

## 18. 当前问题

无阻塞问题。

已知设计决策记录：
1. file:// 安全限制下无法使用 ES Module 或 fetch()，采用经典 `<script src="">` 加载方式
2. Ajv strict:false 以兼容正式 Schema 格式（非代码缺陷）
3. validateFormats:false 因 pattern 已覆盖格式约束
4. 语义非法示例（invalid-protocol-semantic.json）在 D1-R1 被 Schema 层接受——这是正确行为，D1-R2 才拒绝它

## 19. Git 状态

待首次提交（仓库当前无 commit）。

## 20. 下一步

**唯一允许的下一步：**

> **D1-R2 Protocol Semantic Validator**

D1-R2 将实现：
- Phase 存在性检查
- Transition target 可达性
- 不可达 Phase 检测
- Human Gate actor 合规性
- $end 可达性
- Side 数量语义
- Role 数量语义
