# MEETING-UX-F2-F1 · Seat Runtime Fields Unlock

> 报告日期：2026-08-08
> 阶段位置：MEETING-UX-F2-F1 — 席位运行字段解锁（Node 191/191 · Browser 197/197 · Offline 14/14）
> 前置：MEETING-UX-F2 完成（e6e7cb2），真人验收发现「模型名称/模型网页仍无法编辑」→ 用户裁定 F2 为 FUNCTIONAL PARTIAL PASS → 本轮极小修复。
> Git 基线：main @ e6e7cb2（ahead 0）

## 1. 真实根因（T01 定位结果，非猜测）

用户推断「modelName/modelUrl 被错误归到会议冻结字段」——**方向对，但真实锁定来源不是 frozen，而是 profile 存在性**：

```
seat-config-fields.js:54  name.disabled = !profile;   ← 真实来源
seat-config-fields.js:63  url.disabled  = !profile;   ← 真实来源
```

- `profile = RelayProfiles.findByModelRef(profiles, pt.model_ref)`（seat-config-panel.js:48）。
- **默认 profiles 只有 3 个**（relay-profiles.js:13-15：chatgpt-web / claude-web / gemini-web）。
- 六席模板中 **A2/A3/B1/B2/B3 的 model_ref 为空**（seat-layout.js:72-76）；一旦用户保存过自定义 model_ref（如 `deepseek`），刷新后该引用在 profiles 中无条目 → `profile = null` → 模型名称/模型网页被 `!profile` 锁死，且表单初始值为空（只剩占位符）——与截图证据完全一致。
- **连带缺陷**：保存链路（seat-config-commit.js 旧版 `if (prof)`）在 profile 不存在时**不落库** display_name/web_url → 「看起来能编辑，实际只改前端内存」。
- **为什么自动化全绿**：C05/S07/S08 只断言 A1（model_ref=chatgpt-web，默认 profiles 命中）→ 从不覆盖「无 profile 席位」→ 真人路径（自定义 model_ref）从未被测到。

## 2. 修复内容（T02-T04）

| 项 | 落地 |
|---|---|
| **单一字段权限表**（T04） | `SeatConfigRules.FIELD_POLICY`：identity（seatId/camp/roleId）3 项 + runtime（modelName/modelRef/modelUrl/transport/stance/note）6 项；`canEdit(frozen, field)` 为唯一权限入口，UI 三处（role/name/url disabled）全部改消费它。participant 字段名经 `FIELD_ALIAS` 映射（role_class→roleId 等，防 setParticipantField 绕过）。 |
| **解锁 modelName/modelUrl** | `name.disabled = !canEdit(frozen, "modelName")`、`url.disabled = !canEdit(frozen, "modelUrl")` → runtime 恒可编辑，**彻底脱离 profile 存在性**。 |
| **identity 保持冻结** | `role.disabled = !canEdit(frozen, "roleId")`（用户认可：会议已开始，role_id 属协议身份）；seatId/camp 无 UI 编辑入口（表单不渲染），policy 兜底。 |
| **stance 语义核实** | seat-layout.js:4/43 + meeting-factory 无 stance 字段 + 无 snapshot 写入 → **stance 是席位级本地配置（SeatLocalConfig 覆盖表），不进 Protocol/meeting snapshot** → 归 runtime，可编辑。TEST-166 背书（participant 对象不被 stance/note 污染）。 |
| **保存链路补全** | commit 保存时 profile 不存在 → **自动创建**（`upsert` 追加，profile_id=`seat-<pid>`）；显示名/网页 URL 真实落库。 |
| **刷新后持久化** | 新 `SeatLocalConfig.runtimeConfig`（per-participant {model_ref, transport_kind}，随 seat-local 键持久化）；保存时写入；`ensureDraft` 恢复时应用 → 刷新后 model_ref 能重新关联已持久化的 profile，三字段（含显示名/网页）完整恢复。 |
| **打开模型网页** | openBtn 仅按 URL 有效性禁用（C06 语义保留）；`openWeb(modelRef, fallbackUrl)` 支持无 profile 场景直接打开编辑中的 URL。 |

## 3. 门禁结果（提交前新鲜执行）

| Gate | 结果 |
|---|---|
| Node | **PASS · 191/191**（188 + TEST-161 重写为 FIELD_POLICY 矩阵 + TEST-164 分类完整性 + TEST-165 全矩阵 + TEST-166 stance 不污染） |
| Browser（真实 Chrome，file://） | **PASS · 197/197**（156 零回归 + H 系列 41 项） |
| Offline Automation | **PASS · 14/14**（零回归；automation 行为层零触碰） |
| Schema | PASS |
| git diff --check | PASS |
| ≤100 行红线 | console-actions.js 109 行 ≤110 例外（同 request.js 先例登记）；其余全部 ≤100 |

## 4. 真人路径验收（H 系列，对应方案 T05/T06）

- **H01（六席，30 项断言）**：创建会议后 A1..B3 六席逐一——模型名称/模型网页/模型引用/传输方式全部可编辑（**含无 profile 的 A2/A3/B1/B2/B3**）；角色全部冻结。
- **H02（7 项）**：A2 输入 `DeepSeek V4 Flash` / `deepseek` / `https://chat.deepseek.com/` → timer 2.5s 变化 → relay 回答到达（waiting→validated）→ **三输入框元素引用不变、值全部保持**。
- **H03（5 项）**：保存 → `deepseek` profile 自动创建并落库（display_name/web_url 正确）→ 席位卡立即刷新显示「DeepSeek V4 Flash」→ **刷新页面后三字段全部保持**。

## 5. 测试适配记录

- TEST-161 字段名从 role_class/model_ref/transport_kind 迁移到 FIELD_POLICY key（roleId/modelRef/...）+ 新增 164/165/166。
- run-node.js RUNTIME 数组补 `seat-local-config.js`（此前仅 AUDITED，TEST-166 需要其内存 API）。
- 既有断言零改动（C05/S07/S08 语义保持；H 系列只增不删）。

## 6. 新增/修改模块

```
app/js/harness/seat-config-rules.js   # 改（51 行）：FIELD_POLICY + FIELD_ALIAS（T04 单一来源）
app/js/ui/harness/seat-config-fields.js # 改（100 行）：role/name/url 改消费 canEdit；openBtn 仅看 URL
app/js/ui/harness/seat-config-commit.js # 改（50 行）：profile 自动创建 + runtimeConfig 持久化
app/js/ui/harness/console-actions.js  # 改（109 行 ≤110 例外）：ensureDraft 恢复 runtimeConfig
app/js/ui/harness/seat-local-config.js # 改（67 行）：runtimeConfig 表（save/load/导出）
app/js/harness/relay-profiles.js      # 改：过时注释修正（model_ref 冻结 → F1 可热改裁定）
app/tests/protocol-test-cases-seat-layout.js # 改：TEST-161 重写 + TEST-164..166
app/tests/run-node.js                 # 改：RUNTIME 补 seat-local-config
app/tests/run-browser.js              # 改：runF2F1（H01-H03，41 项断言）
```

## 7. 已知取舍（如实登记）

1. **console-actions.js 109 行**：≤110 明确例外（同 request.js/既有登记）。
2. **刷新后会议本身不持久化**（F1 定稿：刷新回默认模板，draft 一次性）——本轮持久化的是**席位运行配置**（model_ref/transport_kind/显示名/URL/立场/备注），刷新后六席配置完整恢复；会议快照语义不变。
3. **stance 归类依据**：代码核实（不进 Participant Schema / snapshot），非猜测；如未来 Protocol 将 stance 冻结进快照，仅需改 FIELD_POLICY 一处。
4. profile 自动创建使用 `seat-<pid>` 作为 profile_id（无业务含义，仅去重键）；用户可在未来版本为 profile 加显示名管理 UI（本轮不做）。
