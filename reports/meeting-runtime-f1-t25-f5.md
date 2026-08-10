# MEETING-RUNTIME-F1-T25-F5 · 秘书席位化与 Summary 闭环 — 开发报告

> 轮次：T25-F5（用户裁定：拿六席之一给秘书 AI，取消独立 System Phase Executor）｜ 基线：F4（Node 236/236 · Browser 319/319）｜ 交付：Node **236/236** · Browser **327/327**

## 一、架构裁定

**统一 Participant Runtime**：秘书 = 一个被赋予 secretary 角色的普通席位（role_class=chair_secretary / role_id=meeting-secretary），summary = 正常 **1/1 席位阶段**，完整复用 Web Relay / validated / 正式接收 / Revision / Revoke / Replay。区别只存在于 role / phase actor / prompt 模板。

```
Physical Seats（A1 A2 A3 | B1 B2 B3）
Meeting Roster（A1, A3, B1）
Opening Phase Roster = [A1, B1]   （2/2）
Summary Phase Roster = [A3]       （1/1）
```

## 二、审计发现（F5-01）

- **Protocol 层几乎零改动**：committee-mvp 的 summary 已是 `actor: { selector: "role_class", role_class: "chair_secretary" }`（按角色解析，不硬编码席位——秘书换席不需要改 Protocol）✓；`required_roles` 已声明 `chair_secretary min 1 max 1` ✓。
- **真差距**：①六席模板 A3 是 advisor（需改为秘书）②`mapParticipants` 按 side 分组——side_id=null 的秘书无法落座 A3 卡 ③Preflight 只查当前阶段 roster（秘书不在 opening → 不被检查）④prompt 无历史发言注入（秘书无输入源、委员无共享上下文）⑤UI 无秘书语义文案。

## 三、修复内容

| 项 | 修复 | 落点 |
| --- | --- | --- |
| F5-02/03 | 模板 `agent-a3` → `chair_secretary / meeting-secretary / seat_id=A3 / web_relay / chatgpt-web`（默认秘书席，非永久写死——协议按 role_class 解析） | seat-layout.js |
| F5-04 | **固定席位映射**：participant 带 seat_id（或 alias 兜底——seat_id 不在 participant 白名单，被 factory 剥离）→ 占对应物理卡；side_id=null 的秘书落 A3 卡，其余席位按 side 顺序 | seat-layout.mapParticipants |
| F5-05/06 | opening `all_advisors` 天然排除 chair_secretary（roster=[A1,B1]）；summary `role_class` 解析 = [A3]——**零 runtime 改动**（验证） | 验证 |
| F5-07/16 | **Preflight 协议级必需角色**：`checkRequiredRoles`——参会名单缺秘书 → 「本场会议需要秘书席，但尚未指定。」；两个秘书 → 「只允许一个秘书席」；秘书无模型 → 普通 blocked（未指定模型） | meeting-admission.js、preflight-panel.js（roleBlock 条目不触发席位跳转） |
| F5-09/10 | **Secretary Prompt 注入**：`effectiveResponses(meeting)` = 所有委员最新有效官方发言（revoked/superseded 自动排除，保留 source=response_id）；renderer 新增「上一阶段正式发言（中立汇总的输入，保留来源）」区块；relay-flow open 自动传入 | meeting-response-state.js、prompt-renderer.js、compile-flow.js、relay-flow.js |
| F5-14 | **shared_context**：`secretarySummary(meeting)` = 秘书最新有效汇总 → critique 阶段所有委员 Prompt 注入同一份「上一阶段秘书汇总（本阶段公共上下文）」 | 同上 |
| F5-08/11/12/13 | summary 进入后 activeSpeaker=A3；**advance 接线 autoOpenNext**（进入新阶段自动打开 web_relay 席位，如秘书）+ followActiveSpeaker；accept 按钮文案「接受为正式秘书汇总」；1/1 → READY_TO_ADVANCE（零 runtime 改动，验证） | meeting-actions.js、web-relay-actions.js、relay-panel.js |
| F5-16 | 席位卡：辩论阶段秘书「等待秘书阶段」、汇总阶段「当前汇总/等待秘书回答/已汇总」、委员跨阶段「上阶段已发言」（latestOfficial 判定）；中央执行者 label「秘书」；点名标题「委员 N · 秘书 M」 | seat-status.js、relay-panel.js、preflight-panel.js |
| 修正 | draft 校验：秘书 web_relay 无模型不阻塞建会（模型完整性归 Preflight——F5-17 语义） | meeting-draft.js |

## 四、测试

- **Node +13（TEST-205..217，S01..S13）**：三层名单 / opening 排除秘书 / summary 仅秘书 / 2/2 进入 / 秘书输入源=A1+B1 最新有效（V2 只取新版、revoked 排除、秘书不把自己当来源）/ validated≠received / accept→1/1→ready / revoke→0/1→running / Replay 一致 / 无秘书 blocked / 双秘书 blocked / Prompt 注入区块 / shared_context 同一份 / A3 固定占卡。
- **Browser +8（F5-01..06）**：点名「委员 2 · 秘书 1」→ A1/B1 真实中继 accept → 2/2 → advance → **A3 自动 open + 秘书 Prompt 含 A1/B1 正式发言与来源** → 秘书接受（「接受为正式秘书汇总」）→ 1/1 → advance → **Round3 委员 Prompt 含同一份秘书汇总**。
- **回归适配**：模板 A3=秘书 → 六席流程 opening 5/5（R1T 全量 /6→/5）；M/W 系列 1v1 变为「委员 2 + 秘书 1」参会；seat-status 秘书 relay 文案。

## 五、门禁

- Node **236/236** · Browser **327/327**（真实 Chrome fresh，含全量 R/B/H/S/M/W/F5 系列 + F3 四视口）✓
- 全部 ≤100 行（meeting-runtime.js 303 / prompt-renderer.js 268 行 D1 豁免）✓ · `git diff --check` PASS ✓ · 临时脚本已清理 ✓
- worktree 未提交（T26 前）✓

## 六、真机复验指引

1. 新建会议（默认模板：A1 ChatGPT 支持方 + B1 DeepSeek 反对方 + A3 ChatGPT 秘书）→ 点名「委员 2 · 秘书 1」→ 开始
2. A1 中继 accept → B1 自动开 → accept → 2/2 → 进入下一阶段
3. **A3 秘书自动开**：Prompt 含「上一阶段正式发言」+ A1/B1 内容与来源 → 粘贴摘要 → 提交 → 校验 → 「接受为正式秘书汇总」→ 1/1
4. 进入下一阶段（Round 3 挑刺）→ A1 Prompt 含同一份「上一阶段秘书汇总」
