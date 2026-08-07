/* AI Council v0.1 — D2-R2 用例：PromptRenderer（InstructionPacket → 人类可读 Prompt）。
 * 覆盖确定性、三种可见性模式红化差异、角色卡含/缺、可见性规则含/缺、输出合同
 * (text/structured_json)、上下文范围、畸形 packet 拒绝、actor 透传、元数据 footer、
 * 与 Compiler 端到端联通。TEST-110..128（总计 109 → 128）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var C = A.Diagnostic.CODE;

  /* ---------- 助手：构造最小合法 packet（不依赖 Compiler，保证渲染测试解耦） ---------- */

  function advisorCard(ctx) { return JSON.parse(ctx.roleCardAdvisorText); }

  function basePacket(ctx) {
    return {
      schema_version: "0.1.0",
      packet_id: "ip-00000000",
      compiler_version: "0.1.0",
      protocol: { protocol_id: "committee", protocol_version: "0.1.0" },
      meeting: { meeting_id: "rt-c", visibility_mode: "semi_anonymous" },
      phase: { phase_id: "opening", phase_kind: "agent_turn", phase_name: "开场陈述" },
      target: { participant_id: "agent-a1", role_class: "advisor", side_id: "A", alias: "A1" },
      instruction: { task: "给出你的初始判断。", context_scope: "meeting", context_keys: ["charter"], include_role_card: true, include_visibility_rules: true },
      role_card: advisorCard(ctx),
      visibility: { mode: "semi_anonymous", allowed_modes: ["public", "semi_anonymous", "full_anonymous"], anonymous: false, rules_included: true },
      output_contract: { mode: "structured_json", required_sections: ["verdict", "rationale"], json_schema: { type: "object", properties: { verdict: { type: "string" }, rationale: { type: "string" } } } },
      actor: { selector: "all_advisors" },
      generated_at: "0001-01-01T00:00:00+00:00",
      deterministic: true
    };
  }

  function withMode(p, mode, anon) {
    p.meeting = { meeting_id: "rt-c", visibility_mode: mode };
    if (p.visibility) { p.visibility.mode = mode; p.visibility.anonymous = !!anon; }
    return p;
  }

  /* 复用 Compiler 测试夹具（同文件模式），用于端到端联通测试 */
  function committeeParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger" }
    ];
  }
  function reg(ctx) {
    return A.RoleCardRegistry.create([JSON.parse(ctx.roleCardAdvisorText), JSON.parse(ctx.roleCardChairSecretaryText)]);
  }
  function freshMeeting(ctx) {
    return A.TestFixtures.buildSession([A.TestFixtures.schemaEntry(ctx.schemaText), A.TestFixtures.protocolEntry("committee", ctx.validText)])
      .then(function (s) { return s.registry.available[0]; })
      .then(function (proto) {
        var m = A.MeetingFactory.createMeeting(proto, { meetingId: "rt-c", participants: committeeParticipants() });
        return { proto: proto, m: m };
      });
  }

  /* ---------- 基础渲染 ---------- */

  T.test("TEST-110", "PromptRenderer：合法 packet → ok，返回非空字符串", function (ctx) {
    var r = A.PromptRenderer.render(basePacket(ctx));
    T.assert(r.ok, "应 ok");
    T.assert(typeof r.text === "string", "text 应为 string");
    T.assert(r.text.length > 0, "text 非空");
    T.assert(r.text.indexOf("AI 顾问委员会") >= 0, "应包含标题");
    return Promise.resolve();
  });

  T.test("TEST-111", "PromptRenderer：同 packet 两次渲染 → 文本完全一致", function (ctx) {
    var p = basePacket(ctx);
    var t1 = A.PromptRenderer.render(p).text;
    var t2 = A.PromptRenderer.render(p).text;
    T.assertEqual(t1, t2, "同输入应产出完全相同的 prompt");
    return Promise.resolve();
  });

  /* ---------- 可见性模式红化差异（Role-Card-Spec §5 / Constitution §4） ---------- */

  T.test("TEST-112", "公开模式：暴露真实 alias / participant_id / 角色", function (ctx) {
    var p = withMode(basePacket(ctx), "public", false);
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("participant_id=agent-a1") >= 0, "应暴露 participant_id");
    T.assert(t.indexOf("A1（") >= 0, "应暴露 alias（A1（");
    T.assert(t.indexOf("角色 顾问") >= 0, "应暴露角色");
    T.assert(t.indexOf("阵营 A") >= 0, "应暴露阵营");
    return Promise.resolve();
  });

  T.test("TEST-113", "半匿名模式：隐藏个人 alias/ID，保留角色与阵营", function (ctx) {
    var p = withMode(basePacket(ctx), "semi_anonymous", false);
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("participant_id=agent-a1") < 0, "半匿名应隐藏 participant_id");
    T.assert(t.indexOf("（A1") < 0, "半匿名应隐藏 alias（A1）");
    T.assert(t.indexOf("角色 顾问") >= 0, "半匿名应保留角色");
    T.assert(t.indexOf("阵营 A") >= 0, "半匿名应保留阵营");
    T.assert(t.indexOf("底层模型身份隐藏") >= 0, "半匿名应声明模型隐藏");
    return Promise.resolve();
  });

  T.test("TEST-114", "完全匿名模式：仅阵营字母+代号，角色与ID隐藏，但角色职责仍对Agent可见", function (ctx) {
    var p = withMode(basePacket(ctx), "full_anonymous", true);
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("participant_id=agent-a1") < 0, "完全匿名应隐藏 participant_id");
    T.assert(t.indexOf("（A1") < 0, "完全匿名应隐藏 alias（A1）");
    T.assert(t.indexOf("角色 顾问") < 0, "完全匿名对外标识应隐藏角色");
    T.assert(t.indexOf("代号 A") >= 0, "完全匿名应给出 A 阵营代号");
    T.assert(t.indexOf("阵营仅以 A 表示") >= 0, "完全匿名应声明阵营仅以字母表示");
    T.assert(t.indexOf("独立陈述初始判断") >= 0, "完全匿名下 Agent 仍须知晓角色职责");
    return Promise.resolve();
  });

  /* ---------- 角色卡含/缺 ---------- */

  T.test("TEST-115", "include_role_card=false（role_card=null）→ 不渲染角色段", function (ctx) {
    var p = basePacket(ctx);
    p.instruction = { task: "x", context_scope: "none", context_keys: null, include_role_card: false, include_visibility_rules: true };
    p.role_card = null;
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("你的角色职责") < 0, "不应渲染角色职责段");
    T.assert(t.indexOf("独立陈述初始判断") < 0, "不应出现职责条目");
    return Promise.resolve();
  });

  T.test("TEST-116", "include_role_card=true → 渲染角色职责（名称/职责/约束/指引）", function (ctx) {
    var t = A.PromptRenderer.render(basePacket(ctx)).text;
    T.assert(t.indexOf("你的角色职责") >= 0, "应渲染角色职责段");
    T.assert(t.indexOf("独立陈述初始判断") >= 0, "应含职责条目");
    T.assert(t.indexOf("不得泄露其他参会者") >= 0, "应含行为约束");
    T.assert(t.indexOf("先给结论再给理由") >= 0, "应含任务指引");
    return Promise.resolve();
  });

  /* ---------- 可见性规则含/缺 ---------- */

  T.test("TEST-117", "include_visibility_rules=false（visibility=null）→ 不渲染可见性规则段", function (ctx) {
    var p = basePacket(ctx);
    p.instruction = { task: "x", context_scope: "none", context_keys: null, include_role_card: true, include_visibility_rules: false };
    p.visibility = null;
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("可见性规则") < 0, "不应渲染可见性规则段");
    return Promise.resolve();
  });

  T.test("TEST-118", "include_visibility_rules=true → 渲染可见性规则段（模式/披露矩阵）", function (ctx) {
    var t = A.PromptRenderer.render(basePacket(ctx)).text;
    T.assert(t.indexOf("可见性规则") >= 0, "应渲染可见性规则段");
    T.assert(t.indexOf("半匿名") >= 0, "应含模式名");
    T.assert(t.indexOf("阵营：公开；角色：公开；底层模型：隐藏") >= 0, "应含披露矩阵");
    return Promise.resolve();
  });

  /* ---------- 输出合同 ---------- */

  T.test("TEST-119", "输出合同 text 模式 → 列出必填小节", function (ctx) {
    var p = basePacket(ctx);
    p.output_contract = { mode: "text", required_sections: ["判断", "理由"] };
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("模式：text") >= 0, "应声明 text 模式");
    T.assert(t.indexOf("必填小节：判断、理由") >= 0, "应列出必填小节");
    return Promise.resolve();
  });

  T.test("TEST-120", "输出合同 structured_json 模式 → 渲染 JSON 骨架", function (ctx) {
    var t = A.PromptRenderer.render(basePacket(ctx)).text;
    T.assert(t.indexOf("模式：structured_json") >= 0, "应声明 structured_json 模式");
    T.assert(t.indexOf("JSON 骨架") >= 0, "应含 JSON 骨架段");
    T.assert(t.indexOf('"verdict"') >= 0, "应含 verdict 字段");
    T.assert(t.indexOf('"rationale"') >= 0, "应含 rationale 字段");
    return Promise.resolve();
  });

  /* ---------- 上下文范围 ---------- */

  T.test("TEST-121", "上下文范围：none 与 selective 键枚举", function (ctx) {
    var none = basePacket(ctx);
    none.instruction.context_scope = "none"; none.instruction.context_keys = null;
    var t1 = A.PromptRenderer.render(none).text;
    T.assert(t1.indexOf("不共享额外上下文") >= 0, "none 应声明不共享上下文");

    var sel = basePacket(ctx);
    sel.instruction.context_scope = "selective"; sel.instruction.context_keys = ["risk", "assumption"];
    var t2 = A.PromptRenderer.render(sel).text;
    T.assert(t2.indexOf("共享键：risk、assumption") >= 0, "selective 应枚举键");
    return Promise.resolve();
  });

  /* ---------- 畸形 packet 拒绝 ---------- */

  T.test("TEST-122", "畸形 packet（null）→ RENDERER_PACKET_INVALID，不抛异常", function (ctx) {
    var r = A.PromptRenderer.render(null);
    T.assert(!r.ok, "应不 ok");
    T.assert(r.diagnostics[0].code === C.RENDERER_PACKET_INVALID, "码应为 RENDERER_PACKET_INVALID");
    return Promise.resolve();
  });

  T.test("TEST-123", "畸形 packet（缺必填字段）→ RENDERER_PACKET_INVALID", function (ctx) {
    var r = A.PromptRenderer.render({});
    T.assert(!r.ok, "应不 ok");
    T.assert(r.diagnostics[0].code === C.RENDERER_PACKET_INVALID, "缺字段应 RENDERER_PACKET_INVALID");
    return Promise.resolve();
  });

  T.test("TEST-124", "未知可见性模式 → RENDERER_PACKET_INVALID（保护红化契约）", function (ctx) {
    var p = basePacket(ctx);
    p.meeting = { meeting_id: "rt-c", visibility_mode: "bogus_mode" };
    var r = A.PromptRenderer.render(p);
    T.assert(!r.ok, "应不 ok");
    T.assert(r.diagnostics[0].code === C.RENDERER_PACKET_INVALID, "未知模式应 RENDERER_PACKET_INVALID");
    return Promise.resolve();
  });

  /* ---------- actor 透传 ---------- */

  T.test("TEST-125", "actor 段：selector 与 selection_key 透传", function (ctx) {
    var all = basePacket(ctx);
    var t1 = A.PromptRenderer.render(all).text;
    T.assert(t1.indexOf("actor.selector = all_advisors") >= 0, "应透传 all_advisors");

    var sel = basePacket(ctx);
    sel.actor = { selector: "selected_participants", selection_key: "battle_participants", participant_ids: ["agent-a1"] };
    var t2 = A.PromptRenderer.render(sel).text;
    T.assert(t2.indexOf("选择键：battle_participants") >= 0, "应透传 selection_key");
    T.assert(t2.indexOf("指定参与者：agent-a1") >= 0, "应透传 participant_ids");
    return Promise.resolve();
  });

  /* ---------- 元数据 footer ---------- */

  T.test("TEST-126", "footer：含 packet_id / renderer 版本 / deterministic", function (ctx) {
    var t = A.PromptRenderer.render(basePacket(ctx)).text;
    T.assert(t.indexOf("packet_id: ip-00000000") >= 0, "应含 packet_id");
    T.assert(t.indexOf("renderer 0.1.0") >= 0, "应含 renderer 版本");
    T.assert(t.indexOf("deterministic") >= 0, "应含 deterministic 标记");
    T.assert(t.indexOf("generated_at 0001-01-01T00:00:00+00:00") >= 0, "应含 generated_at");
    return Promise.resolve();
  });

  /* ---------- null 可见性模式兜底（meeting 未声明模式） ---------- */

  T.test("TEST-127", "meeting.visibility_mode=null → 按 public 兜底渲染身份", function (ctx) {
    var p = basePacket(ctx);
    p.meeting = { meeting_id: "rt-c", visibility_mode: null };
    var t = A.PromptRenderer.render(p).text;
    T.assert(t.indexOf("participant_id=agent-a1") >= 0, "null 模式应兜底为 public 暴露 ID");
    return Promise.resolve();
  });

  /* ---------- 端到端：Compiler → Renderer ---------- */

  T.test("TEST-128", "端到端：InstructionCompiler 产物 → PromptRenderer 成功渲染", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var compiled = A.InstructionCompiler.compile({
        protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx)
      });
      T.assert(compiled.ok, "编译应 ok");
      var rendered = A.PromptRenderer.render(compiled.packet);
      T.assert(rendered.ok, "渲染应 ok：" + (rendered.diagnostics && rendered.diagnostics[0] && rendered.diagnostics[0].message));
      T.assert(rendered.text.indexOf("独立陈述初始判断") >= 0, "端到端应含角色职责");
      T.assert(rendered.text.indexOf("半匿名") >= 0, "端到端 committee 默认半匿名");
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
