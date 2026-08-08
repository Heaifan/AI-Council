# D3 · WEB_AUTOMATION — ChatGPT 单站 PoC（第一版）

> 报告日期：2026-08-08
> 阶段位置：WEB_AUTOMATION · ChatGPT 单站 PoC — 架构落地 + 离线测试全绿（Offline 14/14 · Node 185/185 · Browser 99/99）；**Live ChatGPT E2E 人工验收待用户执行（NOT VERIFIED）**。
> 前置：One-Screen 六席收口 + 一键复制（00dc40e 已提交）。

## 1. 一句话

新增本地 Node Automation Worker（`automation/`）：`node automation/start.js` 启动 127.0.0.1 同源模式（UI + Automation API + 专用 Chrome Profile），把 A1 的 Prompt 自动发给 ChatGPT 网页并自动取回回答；回答必经校验 + 人工 Accept 才进正式会议（自动化只替代「人工搬运」，不替代协议/运行时/校验/裁定）。PoC 只做 ChatGPT 单站，离线测试用仓库 Fake AI Page，不依赖 ChatGPT 在线。

## 2. 方案 → 落地对照（核心条款）

| 方案条款 | 落地 |
|---|---|
| §九/§十二 模块边界 | `automation/{core,browser,drivers,sites,server,ui,tests}` 一个文件一个职责，全部 ≤100 行（测试文件除外） |
| §十/§十一 双启动 | Manual=双击 app/index.html（file:// 不变）；Automation=`node automation/start.js` → http://127.0.0.1:3741/（同源 UI+API，无 CORS/token） |
| §十三/§十四 专用 Profile | `launchPersistentContext(runtime/browser-profile)`；禁止日常 Chrome 默认 Profile；目录已 gitignore |
| §十五 Driver 接口 | `AutomationDriver` 契约（start/openTarget/submitPrompt/waitForResponse/extractResponse/cancel/getStatus/shutdown）；Controller 不 require playwright |
| §十六/§十七 定位优先级 | ARIA/Role（getByRole textbox/button）→ 语义属性（placeholder/contenteditable/data-testid）→ 结构候选（textarea/button，带 visible+尺寸验证）；无 nth-child |
| §二十二 全流程 | Controller → Driver → Adapter → 写 Prompt → 发送 → 条件等待 → 提取 → AgentInvocationResult → UI 显示 → 校验 → 人工 Accept |
| §二十三 禁死等 | UI indicator（Stop 按钮可见性）+ 文本 1.5s 稳定窗口双保险；无 sleep(30000) |
| §二十四 状态机 | idle→launching_browser→opening_target→locating_input→submitting→waiting_response→extracting→completed；异常终态 login_required/locator_not_found/response_timeout/browser_crashed/challenge_detected/cancelled |
| §二十五 登录/验证 | 一律停给人工（AUTOMATION_LOGIN_REQUIRED），绝不绕过（A12 测试覆盖） |
| §二十六/§二十七 UI | 中央大屏「网页自动化」卡：[自动发送给 ChatGPT]（Primary）+ [切换人工中继]；执行中步骤进度；失败原因 + [重试自动化] + [切换人工中继] fallback |
| §二十八/§二十九 错误与证据 | 10 个 AUTOMATION_* 错误码（中文+代码+阶段）；失败自动落盘 runtime/automation-artifacts/<invocation-id>/{screenshot.png,page.html,failure.json}（A12b 测试覆盖） |
| §三十 隐私 | server 只 listen 127.0.0.1；browser-profile/automation-artifacts 均 gitignore |
| §三十一/§三十二 测试分类 | Offline Automation Tests（Fake AI Page，deterministic，14 项）与 Live ChatGPT Acceptance（人工，NOT VERIFIED）严格分离 |
| §三十四 定位健康 | 找到 ≠ 一定正确：全部候选须 visible + 尺寸 ≥20×10 + healthCheck（main/输入区存在） |
| §三十六 VisionLocator | 只冻结接口（automation/drivers/visual-locator.js：boundingBox/confidence/method/evidence），不实现；触发条件见文件头 |
| §十八/§十九 | Visual 三手段（Template/OCR/VLM）仅接口登记，不做第一层 |

## 3. 关键设计决策

1. **app/js 零网络纪律保持**（TEST-10）：app 侧只有 `AutomationBridge` no-op 占位 + `AutomationView` 面板（dispatch 事件）；真实 fetch/轮询实现在 `automation/ui/automation-ui.js`（localhost 由 static-server 注入 `<body>`，file:// 不加载）。这样 99 项 Browser 基线零回归。
2. **Controller 支持 adapterFactory/driverFactory 注入**：离线测试注入 fake adapter + headless driver，生产默认 chatgpt + 有头专用 Profile。
3. **fake-ai-page.html**：模拟输入区/发送/生成中/停止/回答区/登录墙（?login=1），无网络无真实 AI，800ms 确定性回复。
4. **回答进入 UI 的方式**：自动化结果写回 Response textarea（relay-paste）+ 提示「未经校验」；用户走既有「提交回答 → 校验 → 接受」链——自动化结果**绝不自动 Accept**（A11 断言）。

## 4. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Offline Automation（Fake AI Page） | **PASS · 14/14**（A01..A12b） |
| Node（app 侧回归） | **PASS · 185/185**（零回归） |
| Browser（真实 Chrome，file://） | **PASS · 99/99**（零回归；自动化 UI 仅 localhost 注入，不影响基线） |
| Server 冒烟（health/注入/automate 202/404） | **PASS** |
| ≤100 行红线（automation 生产文件） | **PASS**（测试文件 137 行不受限） |
| Live ChatGPT E2E | **NOT VERIFIED**（待人工验收 §6） |

## 5. 文件清单（automation/，全部新）

```
automation/
├─ start.js                        # 入口（127.0.0.1:3741，仅本机）
├─ core/automation-errors.js       # 10 个 AUTOMATION_* 错误码 + AutomationError
├─ core/automation-result.js       # AutomationResult（ok/responseText/error/artifactDir）
├─ core/automation-session.js      # 状态机 + 步骤进度
├─ core/automation-controller.js   # 编排 + 失败证据落盘
├─ browser/browser-profile.js      # runtime/browser-profile（gitignore）+ artifacts 目录
├─ drivers/automation-driver.js    # 接口契约
├─ drivers/playwright-driver.js    # 主路径实现（launchPersistentContext + 条件等待）
├─ drivers/visual-locator.js       # VisionLocator 接口冻结（不实现）
├─ sites/site-adapter.js           # 站点适配器工厂（PoC 仅 chatgpt）
├─ sites/chatgpt-adapter.js        # ChatGPT：候选定位 + 生成检测 + 提取
├─ server/static-server.js         # app/ 静态服务 + automation-ui.js 注入
├─ server/automation-server.js     # /api/automate + /api/status + /api/result + /api/health
├─ ui/automation-ui.js             # 覆写 Bridge 为同源 fetch（localhost 注入）
└─ tests/offline-automation-tests.js  # A01..A12b（Fake AI Page）
    tests/smoke-server.js          # server 冒烟（health/注入/API/404）
tests/fixtures/fake-ai-page.html   # 假 AI 页面（输入/发送/生成中/回答/登录墙）
app/js/ui/harness/automation-bridge.js  # app 侧 no-op 占位（零网络）
app/js/ui/harness/automation-view.js    # 中央大屏自动化面板（按钮/进度/fallback）
```

## 6. Live ChatGPT 人工验收（待用户，NOT VERIFIED）

1. `node automation/start.js`
2. 浏览器打开 http://127.0.0.1:3741/ → 选择项目目录 → 创建会议（A1 为网页中继）
3. 首次：专用 Chrome（runtime/browser-profile）打开 ChatGPT 并登录
4. A1 当前发言 → 点「自动发送给 ChatGPT」
5. 不碰鼠标：Prompt 自动进入 ChatGPT → ChatGPT 回答 → 回答自动回到 AI-Council Response 区
6. 确认：显示「未经校验」提示，**尚未成为正式 Message**
7. 点「提交回答」→ 校验通过 → 点「接受为正式发言」→ Runtime 继续
8. 失败路径抽查：断网/改 ChatGPT 页面 → 失败原因 + 截图证据（runtime/automation-artifacts/）→ [切换人工中继] 可用

## 7. 未决项（如实登记）

1. **影刀集成可行性审计（TODO 30）未执行**：本会话无 web 调研工具，无法核实影刀是否提供外部 Node 可调用 API/CLI/IPC。按方案 §二十：**未审计前不得实现 YingDaoDriver**。登记后续轮次（需网络调研或用户提供影刀文档）。
2. **Live ChatGPT E2E**：NOT VERIFIED，待人工验收（§6）。
3. **生成参数**（稳定窗口 1.5s、超时 120s）：fake 页验证通过，真实 ChatGPT 需实机微调（方案 §二十三「具体参数后续通过实机调」）。
