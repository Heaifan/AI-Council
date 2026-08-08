# ONE-SCREEN-F1 · 无滚动工作区 + 席位编辑恢复

> 报告日期：2026-08-08
> 阶段位置：ONE-SCREEN-F1 — 一屏 UI 修复 + 席位编辑恢复（Node 188/188 · Browser 135/135 · Offline 14/14）
> 前置：WEB_AUTOMATION PoC 完成（12f1c93），用户裁定「两个基础问题没解决之前继续测自动化没有意义」，本轮只修这两个问题。
> Git 基线：main @ 9e5dc7c（干净）

## 1. 一句话

按用户 ONE-SCREEN-F1 方案逐字执行：**① 消灭会议主界面所有常驻滚动条（100dvh flex 工作台 + 六席紧凑卡 + 中央双栏 + 底部 drawer）；② 修复「会议冻结 → 六席配置整体锁死」的错误耦合（字段级冻结 + 显式保存 + localStorage 持久化）**。未触碰 Web Automation、会议协议、其他 UI。

## 2. 根因（T01 定位）

| 问题 | 根因 |
|---|---|
| 滚动条 | ① `.console` 硬编码 `height: calc(100vh-212px)` + `min-height:480px`，底部 devtools/时间线在 flex 流内再占实际高度 → 内容必然溢出；② 三栏各自 `overflow-y:auto` 掩盖高度设计问题；③ 席位卡 6 行字段逐行堆叠（~200px+/卡）；④ 中央 seat 表单单列 7 字段（~380px）；⑤ 无会议时 mode-bar+context+会议表单+席位表单四卡堆叠。 |
| 席位不能编辑 | ① `console-actions.js` 的 `frozen` 在 `setParticipantField` **整体拒绝所有字段**（不只 UI disabled——保存路径也被锁）；② `seat-config-fields.js` 把 `role/model_ref/transport_kind` 三个 `disabled=frozen` 整体锁死 → 用户看到「会议 S1 已冻结 + 核心配置已冻结」后六席全灰。 |

## 3. 方案 → 落地对照（核心条款）

| 方案条款 | 落地 |
|---|---|
| §二 100dvh 固定工作台 | body = flex 列 + `overflow:hidden`；`main` flex:1 min-height:0；`#tab-meeting.active` flex 列；`.console` flex:1 min-height:0（删除 calc 魔法数与 min-height:480）。**修复过程中发现根因：旧 CSS 丢失 `html{height:100%}` 后 html 被内容撑开形成自举放大**。 |
| §二 1366×768 主门禁 | 实测顶部固定区 206px；seat 模式中央内容从 745px 压到 518px 恰好填满可用高度；左右栏 3 卡+摘要卡 518px 恰好填满。 |
| §三 席位卡 130-145px | 6 行字段 → 4 行紧凑摘要（头：编号+角色+当前轮次徽标 / 摘要：显示名·引用 / 元信息：传输·立场 / 状态行 / 按钮行），卡高 ~132px。 |
| §四 中央双栏 | 会议配置卡：名称/议事规则双栏 + 议题跨列（rows 3→2）；席位配置卡：角色/名称、引用/网页、传输/立场双栏 + 备注跨列 + 取消/保存/打开网页底部；**删除 `overflow-y:auto` 常规布局**。 |
| §五 bottom drawer | `#console-drawer`（32px 条，devtools + 时间线左右各半）：默认折叠；展开内容 `position:absolute` 覆盖工作区（`max-height:45vh` 内部滚动），**不挤压 workspace**（F17 断言高度差 <2px）；重绘保留用户展开状态（先读后清）。 |
| §六 禁 zoom/scale | 全程无 zoom/transform scale；全部通过 padding/gap/双栏/flex/drawer 实现。 |
| §七/§八 冻结解耦 | `SeatConfigRules`（新，纯逻辑）：`FROZEN_FIELDS=["role_class"]` 字段级权限；`applyToParticipant(p, edits, frozen)` 创建后 role 拒改、model_ref/transport_kind 热改；`console-actions` 与 `seat-config-commit` 共用。立场/备注经 SeatLocalConfig（本地配置）永可编辑；role_id 进会议身份保持冻结。 |
| §九 配置按钮永可点 | 既有 `seat-edit-*` 仅空席禁用（未因 frozen 禁用）——保持；新增 F04 六席逐一进配置断言。 |
| §十 交互简化 | 挂起式编辑：change 只更新本地 `edits`；[保存配置]（seat-config-save）→ `SeatConfigCommit.run` 写入 participant/profile/stance/note → `✓ X 配置已保存` → **自动回会议运行**；[取消]（seat-config-cancel）直接返回丢弃。删除「返回会议运行」按钮（seat-config-back）。 |
| §十一 持久化 | `LocalStore`（新，localStorage 封装，异常静默降级）+ `SeatSessionStore`（新，draft/profiles 读写）+ SeatLocalConfig 持久化；键前缀 `ai-council:v1:`；draft 一次性创建（create 后清除）；`reset()` 只清内存不清存储（刷新/重选目录后配置保持）。 |
| §十二 四档分辨率 | 1920×1080 / 1600×900 / 1366×768 / 1280×720 全部无整体滚动（F03 断言）；1366 主门禁页面/控制台/左/中/右均无滚动条（F01 断言）。 |

## 4. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node（app 侧回归） | **PASS · 188/188**（185 零回归 + TEST-161/162/163 冻结矩阵） |
| Browser（真实 Chrome，file://） | **PASS · 135/135**（99 零回归 + F01..F18 三十六项新增） |
| Offline Automation（Fake AI Page） | **PASS · 14/14**（零回归） |
| Schema 验证 | **PASS** |
| git diff --check | PASS |
| ≤100 行红线 | PASS（console-actions.js 110 行 ≤110 登记例外，同 request.js 先例；seat-config-fields.js 100） |

## 5. 测试适配记录（行为变化 → 改驱动步骤不改断言）

- **devtools 默认折叠（F1 方案推翻 D3 旧妥协）**：5 处直接点击 `#mt-create*` / `#mt-clear` 的既有测试改为 `clickDevBtn`（展开 → 点击 → 立即折叠）——展开时 drawer overlay 会拦截工作区按钮，必须用完即收。
- **C06/C07 保持零改动**：openBtn 的 disabled 按挂起式 edits.web_url 实时计算（url change 时同步更新按钮），C06「非法 URL 禁用」即时生效；C07 默认 URL 与断言值一致。
- **S 系列零改动**：创建前后冻结断言（S10 议题只读）语义不变；S05/S06 点卡进配置不受 mode-bar 隐藏影响。

## 6. 新增模块

```
app/js/harness/local-store.js         # LocalStore（35 行）：localStorage JSON 封装，异常静默降级
app/js/harness/seat-config-rules.js   # SeatConfigRules（35 行）：字段级冻结矩阵 + applyToParticipant（Node 可测）
app/js/harness/seat-session-store.js  # SeatSessionStore（40 行）：draft/profiles 本地持久化
app/js/ui/harness/seat-config-commit.js # SeatConfigCommit（45 行）：显式保存提交（写入+自动回运行）
```

## 7. 已知取舍（如实登记）

1. **1280×720 中央席位配置允许内部滚动**（`@media (max-height:760px) #console-seat{overflow-y:auto}`）：720 可用高度 462px，双表单 489px 超 27px；方案 §十二允许 720 进入 compact mode，此处以「仅该档中央表单内部滚动」为 compact 极限（1366×768 主门禁无任何滚动）。页面级/左右栏 720 均无滚动。
2. **seat 模式隐藏顶部模式条与上下文卡**：无会议时中央四卡（mode/context/会议表单/席位表单）叠加超一屏，seat 模式下隐藏冗余两卡（省 80px）——模式切换由 [取消]/[保存配置] 表达（保存自动回运行）。
3. **console-actions.js 110 行**：≤110 明确例外（同 request.js 106 行先例），持久化逻辑已拆 SeatSessionStore 后仍 110。
4. **draft 持久化只覆盖创建前**：创建后刷新会议本身仍丢失（既有手动存档架构，方案未要求自动恢复）；席位配置（显示名/URL/备注/立场 + 创建前引用/传输）跨刷新保持。
5. **换目录/重选目录不清席位配置**：LocalStore 键独立于项目；若 protocolId 与所选目录规则不匹配，创建时给出「选中的议事规则不可用」提示（可重选）。

## 8. 验收对照（方案 §五 十项）

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 1920×1080 无主滚动条 | ✅ F03 |
| 2 | 1600×900 无主滚动条 | ✅ F03 |
| 3 | 1366×768 无主滚动条 | ✅ F01 |
| 4 | 六席同时可见 | ✅ F02 |
| 5 | 左/中/右无常驻纵向 scrollbar | ✅ F01（1366 主门禁；720 取舍见 §7.1） |
| 6 | 六席逐一可进入配置 | ✅ F04 |
| 7 | 六席可编辑字段逐一保存 | ✅ F05-F12 + F14（含创建后热改） |
| 8 | 刷新页面后配置仍存在 | ✅ F14（六席备注 + A1 显示名） |
| 9 | frozen 快照不被配置修改污染 | ✅ F13（保存不产生会议事件）+ TEST-163（角色冻结值不被污染） |
| 10 | Offline/Node/Browser 全部通过 | ✅ 14/14 + 188/188 + 135/135 |
