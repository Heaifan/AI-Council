/* AI Council v0.1 — D2-R1 用例：Instruction Compiler / Role Card Registry。
 * 覆盖确定性、Role Card 解析、可见性/上下文/输出合同透传、actor 解析、各类拒绝路径、
 * InstructionPacket Schema 校验、JSON 安全。TEST-85..109（总计 84 → 109）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;
  var FACTORY = A.MeetingFactory;
  var C = A.Diagnostic.CODE;

  /* ---------- 助手 ---------- */

  function committeeParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary" }
    ];
  }

  function reg(ctx) {
    return A.RoleCardRegistry.create([
      JSON.parse(ctx.roleCardAdvisorText),
      JSON.parse(ctx.roleCardChairSecretaryText)
    ]);
  }

  function committeeProto(ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)])
      .then(function (s) { return s.registry.available[0]; });
  }

  function freshMeeting(ctx) {
    return committeeProto(ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, { meetingId: "rt-c", participants: committeeParticipants() });
      return { proto: proto, m: m };
    });
  }

  /* 用 Ajv2020 bundle 校验任意 Schema（测试内联使用，与正式校验器解耦） */
  function validateWith(schemaText, obj) {
    var b = root.AjvBundle;
    var Ajv = b.default || b.Ajv2020 || b;
    var ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
    var sc = JSON.parse(schemaText);
    ajv.addSchema(sc);
    var ok = ajv.validate(sc.$id, obj) === true;
    return { ok: ok, errors: ok ? [] : (ajv.errors || []) };
  }

  /* 克隆协议 document 并改写某 phase 的 instruction 字段（不改原始协议） */
  function patchPhase(proto, phaseId, instructionPatch) {
    var doc = JSON.parse(JSON.stringify(FACTORY.docOf(proto)));
    doc.phases.forEach(function (p) {
      if (p.phase_id === phaseId) {
        Object.keys(instructionPatch).forEach(function (k) { p.instruction[k] = instructionPatch[k]; });
      }
    });
    return doc;
  }

  /* ---------- Role Card Registry ---------- */

  T.test("TEST-85", "RoleCardRegistry：按 role_class 解析 advisor / chair_secretary", function (ctx) {
    var r = reg(ctx);
    T.assert(r.ok, "registry 创建应 ok");
    T.assert(r.hasRoleClass("advisor"), "应有 advisor");
    T.assert(r.hasRoleClass("chair_secretary"), "应有 chair_secretary");
    var adv = r.byRoleClass("advisor");
    T.assert(adv && adv.role_class === "advisor", "advisor 卡片 role_class");
    T.assert(adv.role_id === "advisor-base", "advisor role_id");
    return Promise.resolve();
  });

  T.test("TEST-86", "RoleCardRegistry：同 role_class 多卡 → 升序确定性 pick", function (ctx) {
    var cards = [
      JSON.parse(ctx.roleCardAdvisorText),
      { schema_version: "0.1.0", role_id: "zzz-advisor", name: "Z", version: "0.1.0", source: "built_in", role_class: "advisor", description: "d", responsibilities: ["r"], focus_areas: ["f"], behavioral_constraints: ["b"] },
      { schema_version: "0.1.0", role_id: "aaa-advisor", name: "A", version: "0.1.0", source: "built_in", role_class: "advisor", description: "d", responsibilities: ["r"], focus_areas: ["f"], behavioral_constraints: ["b"] }
    ];
    var r = A.RoleCardRegistry.create(cards);
    T.assert(r.ok, "ok");
    T.assert(r.byRoleClass("advisor").role_id === "aaa-advisor", "应 pick 升序第一张 aaa-advisor");
    return Promise.resolve();
  });

  T.test("TEST-87", "RoleCardRegistry：非法卡片 → ROLE_CARD_INVALID", function (ctx) {
    var r = A.RoleCardRegistry.create([{ role_id: "x" }]); /* 缺 role_class / name */
    T.assert(!r.ok, "应不 ok");
    T.assert(r.diagnostic.code === C.ROLE_CARD_INVALID, "码应为 ROLE_CARD_INVALID");
    return Promise.resolve();
  });

  T.test("TEST-88", "RoleCardRegistry：hasRoleClass 命中/未命中", function (ctx) {
    var r = reg(ctx);
    T.assert(r.hasRoleClass("advisor") === true, "advisor 命中");
    T.assert(r.hasRoleClass("chair") === false, "chair 未命中");
    return Promise.resolve();
  });

  T.test("TEST-89", "示例 Role Card 通过 role.schema.json 校验", function (ctx) {
    var cards = [JSON.parse(ctx.roleCardAdvisorText), JSON.parse(ctx.roleCardChairSecretaryText)];
    cards.forEach(function (card) {
      var v = validateWith(ctx.roleSchemaText, card);
      T.assert(v.ok, "Role Card " + card.role_id + " 应通过 role.schema：" + JSON.stringify(v.errors));
    });
    return Promise.resolve();
  });

  /* ---------- Compiler 确定性 / 内容寻址 ---------- */

  T.test("TEST-90", "Compiler 确定性：同输入两次编译 → 深度相等", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var base = { protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) };
      var r1 = A.InstructionCompiler.compile(base);
      var r2 = A.InstructionCompiler.compile(base);
      T.assert(r1.ok && r2.ok, "两次编译都应 ok");
      T.assertEqual(JSON.stringify(r1.packet), JSON.stringify(r2.packet), "同输入应产出完全相同的 packet");
    });
  });

  T.test("TEST-91", "Compiler：同输入 → 相同 packet_id（格式 ip-xxxxxxxx）", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var base = { protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) };
      var id1 = A.InstructionCompiler.compile(base).packet.packet_id;
      var id2 = A.InstructionCompiler.compile(base).packet.packet_id;
      T.assertEqual(id1, id2, "packet_id 应稳定");
      T.assert(/^ip-[0-9a-f]{8}$/.test(id1), "packet_id 格式应为 ip-xxxxxxxx");
    });
  });

  T.test("TEST-92", "Compiler：任务文本改变 → packet_id 变化（内容寻址）", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var base = { protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) };
      var id1 = A.InstructionCompiler.compile(base).packet.packet_id;
      var doc = patchPhase(s.proto, "opening", { task: "篡改后的任务文本。" });
      var base2 = { protocol: doc, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) };
      var id2 = A.InstructionCompiler.compile(base2).packet.packet_id;
      T.assert(id1 !== id2, "任务文本变化应改变 packet_id");
    });
  });

  T.test("TEST-93", "Compiler：目标参与者不同 → packet_id 不同", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var mk = function (pid) { return { protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: pid, roleRegistry: reg(ctx) }; };
      var idA = A.InstructionCompiler.compile(mk("agent-a1")).packet.packet_id;
      var idB = A.InstructionCompiler.compile(mk("agent-b1")).packet.packet_id;
      T.assert(idA !== idB, "不同参与者应产生不同 packet_id");
    });
  });

  /* ---------- Role Card 包含控制 ---------- */

  T.test("TEST-94", "Compiler：include_role_card=true → role_card 解析为 advisor 卡", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "ok");
      T.assert(r.packet.role_card && r.packet.role_card.role_class === "advisor", "role_card 应为 advisor");
      T.assertEqual(JSON.stringify(r.packet.role_card), JSON.stringify(JSON.parse(ctx.roleCardAdvisorText)), "role_card 深度等于示例卡");
    });
  });

  T.test("TEST-95", "Compiler：要求 Role Card 但注册表缺 role_class → ROLE_CARD_NOT_FOUND", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var onlyChair = A.RoleCardRegistry.create([JSON.parse(ctx.roleCardChairSecretaryText)]);
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: onlyChair });
      T.assert(!r.ok, "应不 ok");
      T.assert(r.diagnostics.some(function (d) { return d.code === C.ROLE_CARD_NOT_FOUND; }), "应含 ROLE_CARD_NOT_FOUND");
    });
  });

  T.test("TEST-96", "Compiler：include_role_card=false → role_card 为 null", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var doc = patchPhase(s.proto, "opening", { include_role_card: false });
      var r = A.InstructionCompiler.compile({ protocol: doc, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "ok");
      T.assert(r.packet.role_card === null, "role_card 应为 null");
    });
  });

  /* ---------- Visibility 包含控制 ---------- */

  T.test("TEST-97", "Compiler：include_visibility_rules=true → visibility 非 null", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "ok");
      T.assert(r.packet.visibility !== null, "visibility 应非 null");
      T.assert(r.packet.visibility.mode === "semi_anonymous", "meeting 默认半匿名");
      T.assert(r.packet.visibility.anonymous === false, "半匿名不是完全匿名");
      T.assert(r.packet.visibility.allowed_modes.length === 3, "允许三种模式");
      T.assert(r.packet.visibility.rules_included === true, "rules_included 应为 true");
    });
  });

  T.test("TEST-98", "Compiler：include_visibility_rules=false → visibility 为 null", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var doc = patchPhase(s.proto, "opening", { include_visibility_rules: false });
      var r = A.InstructionCompiler.compile({ protocol: doc, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "ok");
      T.assert(r.packet.visibility === null, "visibility 应为 null");
    });
  });

  /* ---------- 指令字段透传 ---------- */

  T.test("TEST-99", "Compiler：context_scope / context_keys 透传", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r1 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r1.packet.instruction.context_scope === "meeting", "opening 应为 meeting");

      var doc = patchPhase(s.proto, "opening", { context_scope: "selective", context_keys: ["risk", "assumption"] });
      var r2 = A.InstructionCompiler.compile({ protocol: doc, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r2.packet.instruction.context_scope === "selective", "selective");
      T.assertEqual(JSON.stringify(r2.packet.instruction.context_keys), JSON.stringify(["risk", "assumption"]), "context_keys 透传");

      var doc3 = patchPhase(s.proto, "opening", { context_scope: "none", context_keys: null });
      var r3 = A.InstructionCompiler.compile({ protocol: doc3, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r3.packet.instruction.context_scope === "none", "none");
      T.assert(r3.packet.instruction.context_keys === null, "none 时 context_keys 为 null");
    });
  });

  T.test("TEST-100", "Compiler：output_contract 透传（structured_json / text）", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r1 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r1.packet.output_contract.mode === "structured_json", "opening 为 structured_json");
      T.assert(r1.packet.output_contract.json_schema && typeof r1.packet.output_contract.json_schema === "object", "含 json_schema");

      s.m.stateData.battle_participants = ["agent-a1"];
      var r2 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "battle", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r2.packet.output_contract.mode === "text", "battle 为 text");
      T.assert(r2.packet.output_contract.json_schema === undefined, "text 模式无 json_schema");
    });
  });

  T.test("TEST-101", "Compiler：actor.selector 透传各类型", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r1 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r1.packet.actor.selector === "all_advisors", "all_advisors");

      var r2 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "summary", participantId: "chair-secretary-1", roleRegistry: reg(ctx) });
      T.assert(r2.packet.actor.selector === "role_class", "role_class");
      T.assert(r2.packet.actor.role_class === "chair_secretary", "actor.role_class 透传");

      s.m.stateData.battle_participants = ["agent-a1"];
      var r3 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "battle", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r3.packet.actor.selector === "selected_participants", "selected_participants");
      T.assert(r3.packet.actor.selection_key === "battle_participants", "selection_key 透传");
    });
  });

  /* ---------- 拒绝路径 ---------- */

  T.test("TEST-102", "Compiler：非法 phaseId → COMPILER_PHASE_NOT_FOUND", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "nope", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(!r.ok, "不 ok");
      T.assert(r.diagnostics[0].code === C.COMPILER_PHASE_NOT_FOUND, "码");
    });
  });

  T.test("TEST-103", "Compiler：非法 participantId → COMPILER_PARTICIPANT_NOT_FOUND", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "ghost", roleRegistry: reg(ctx) });
      T.assert(!r.ok, "不 ok");
      T.assert(r.diagnostics[0].code === C.COMPILER_PARTICIPANT_NOT_FOUND, "码");
    });
  });

  T.test("TEST-104", "Compiler：参与者不在 actor 目标集 → COMPILER_PARTICIPANT_NOT_TARGETED", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "chair-secretary-1", roleRegistry: reg(ctx) });
      T.assert(!r.ok, "不 ok");
      T.assert(r.diagnostics[0].code === C.COMPILER_PARTICIPANT_NOT_TARGETED, "码");
    });
  });

  T.test("TEST-105", "Compiler：human_gate / system phase → COMPILER_NO_AGENT_TARGET", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "human-decision", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(!r.ok, "不 ok");
      T.assert(r.diagnostics[0].code === C.COMPILER_NO_AGENT_TARGET, "human-decision 应 NO_AGENT_TARGET");
    });
  });

  T.test("TEST-106", "Compiler：battle selected_participants 解析", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      s.m.stateData.battle_participants = ["agent-a1"];
      var r1 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "battle", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r1.ok, "agent-a1 在 battle 目标内应 ok");
      var r2 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "battle", participantId: "agent-b1", roleRegistry: reg(ctx) });
      T.assert(!r2.ok, "agent-b1 不在 battle 目标内应不 ok");
      T.assert(r2.diagnostics[0].code === C.COMPILER_PARTICIPANT_NOT_TARGETED, "码");
    });
  });

  /* ---------- Schema 校验 / JSON 安全 ---------- */

  T.test("TEST-107", "Compiler：产物通过 instruction-packet.schema.json（含 battle/text）", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var v = A.InstructionPacketSchemaValidator.create(JSON.parse(ctx.instructionPacketSchemaText));
      T.assert(v.ok, "校验器创建 ok");

      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "compile ok");
      var res = v.validate(r.packet);
      T.assert(res.ok, "opening packet 应通过 schema：" + JSON.stringify(res.diagnostics));

      s.m.stateData.battle_participants = ["agent-a1"];
      var rb = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "battle", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(rb.ok, "battle compile ok");
      var resB = v.validate(rb.packet);
      T.assert(resB.ok, "battle packet 应通过 schema：" + JSON.stringify(resB.diagnostics));
    });
  });

  T.test("TEST-108", "Compiler：产物 JSON-safe（无 Map/Set/Function，往返等价）", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.ok, "ok");
      var round = JSON.parse(JSON.stringify(r.packet));
      T.assertEqual(JSON.stringify(round), JSON.stringify(r.packet), "JSON 往返等价");
      (function walk(o) {
        if (o === null || typeof o !== "object") return;
        Object.keys(o).forEach(function (k) {
          T.assert(typeof o[k] !== "function", "不应含 Function 属性：" + k);
          walk(o[k]);
        });
      })(r.packet);
    });
  });

  T.test("TEST-109", "Compiler：setClock 覆盖 generated_at，重置后回到默认", function (ctx) {
    return freshMeeting(ctx).then(function (s) {
      var FIXED = "2026-08-07T12:00:00+08:00";
      A.InstructionCompiler.setClock(function () { return FIXED; });
      var r = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r.packet.generated_at === FIXED, "generated_at 应为注入时间");

      A.InstructionCompiler.setClock(null); /* 重置为确定性默认 */
      var r2 = A.InstructionCompiler.compile({ protocol: s.proto, meeting: s.m, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg(ctx) });
      T.assert(r2.packet.generated_at === "0001-01-01T00:00:00+00:00", "重置后应回到确定性默认时间");
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
