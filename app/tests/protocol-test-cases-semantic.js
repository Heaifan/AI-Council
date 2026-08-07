/* AI Council v0.1 — D1-R2 用例：Protocol Semantic Validator 确定性语义校验。
 * 所有非法变体都从正式 valid-protocol-committee-mvp.json 派生（F.patch），确保它们先通过 Schema 层、再被 Semantic 层拒绝。
 * 多错误测试验证 Validator 不 fail-fast（一次返回全部诊断）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;
  var C = A.Diagnostic.CODE;

  function codes(s) { return s.registry.invalid[0].diagnostics.map(function (d) { return d.code; }); }
  function hasCode(s, code) {
    T.assert(s.registry.counts.invalid >= 1, "应进入 Invalid（语义失败）");
    T.assert(codes(s).indexOf(code) >= 0, "缺少诊断码 " + code + "，实际：" + codes(s).join(","));
  }

  /* TEST-16 — 合法 committee-mvp 通过语义校验 */
  T.test("TEST-16", "合法 committee-mvp → 语义通过，Available=1 / Invalid=0", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("mvp", ctx.validText)])
      .then(function (s) {
        T.assertEqual(s.registry.counts.available, 1, "Available");
        T.assertEqual(s.registry.counts.invalid, 0, "Invalid（语义合法）");
      });
  });

  /* TEST-17 — 重复 Phase ID */
  T.test("TEST-17", "重复 Phase ID → SEMANTIC_DUPLICATE_PHASE_ID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      var dup = JSON.parse(JSON.stringify(o.phases[0]));
      dup.phase_id = "opening";            // 与 phases[0] 重复
      o.phases.push(dup);
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("dup-phase", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_DUPLICATE_PHASE_ID); });
  });

  /* TEST-18 — initial_phase_id 不存在 */
  T.test("TEST-18", "initial_phase_id 指向不存在的 Phase → SEMANTIC_INITIAL_PHASE_NOT_FOUND", function (ctx) {
    var text = F.patch(ctx.validText, function (o) { o.initial_phase_id = "no-such-phase"; });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("bad-init", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_INITIAL_PHASE_NOT_FOUND); });
  });

  /* TEST-19 — 不可达 Phase */
  T.test("TEST-19", "存在孤立 Phase → SEMANTIC_UNREACHABLE_PHASE", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      var orphan = JSON.parse(JSON.stringify(o.phases[0]));
      orphan.phase_id = "orphan-phase";
      orphan.transitions = [{ trigger: "complete", target: "$end" }];
      o.phases.push(orphan);
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("orphan", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_UNREACHABLE_PHASE); });
  });

  /* TEST-20 — $end 不可达（自环、无 $end 边） */
  T.test("TEST-20", "无通往 $end 的路径 → SEMANTIC_END_NOT_REACHABLE（合法环不误报不可达）", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.phases.forEach(function (p) {
        if (p.phase_id === "archive") p.transitions[0].target = "critique";  // 移除唯一 $end 边
      });
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("noloop", text)])
      .then(function (s) {
        hasCode(s, C.SEMANTIC_END_NOT_REACHABLE);
        T.assert(codes(s).indexOf(C.SEMANTIC_UNREACHABLE_PHASE) < 0, "合法环不应误报不可达");
      });
  });

  /* TEST-21 — 合法循环不被误杀 */
  T.test("TEST-21", "含合法循环（human-decision↔critique）仍 Semantic PASS", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("cycle", ctx.validText)])
      .then(function (s) {
        T.assertEqual(s.registry.counts.available, 1, "Available（合法循环应通过）");
        T.assertEqual(s.registry.counts.invalid, 0, "Invalid");
      });
  });

  /* TEST-22 — Human Gate Actor */
  T.test("TEST-22", "human_gate + actor≠human_arbiter → SEMANTIC_HUMAN_GATE_ACTOR_INVALID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.phases.forEach(function (p) { if (p.kind === "human_gate") p.actor.selector = "all_advisors"; });
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("gate-actor", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_HUMAN_GATE_ACTOR_INVALID); });
  });

  /* TEST-23 — Human Gate Completion */
  T.test("TEST-23", "human_gate + completion≠human_decision → SEMANTIC_HUMAN_GATE_COMPLETION_INVALID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.phases.forEach(function (p) { if (p.kind === "human_gate") p.completion.mode = "all_selected_respond"; });
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("gate-comp", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_HUMAN_GATE_COMPLETION_INVALID); });
  });

  /* TEST-24 — 重复 Side */
  T.test("TEST-24", "重复 Side ID → SEMANTIC_SIDE_ID_DUPLICATE", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      var dup = JSON.parse(JSON.stringify(o.participant_policy.sides[0]));
      o.participant_policy.sides.push(dup);   // side_id "A" 重复
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("dup-side", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_SIDE_ID_DUPLICATE); });
  });

  /* TEST-25 — Side min > max */
  T.test("TEST-25", "Side min_members > max_members → SEMANTIC_SIDE_MEMBER_RANGE_INVALID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.participant_policy.sides[0].min_members = 5;
      o.participant_policy.sides[0].max_members = 1;
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("side-range", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_SIDE_MEMBER_RANGE_INVALID); });
  });

  /* TEST-26 — Side 总容量不可能 */
  T.test("TEST-26", "sum(side.max) < min_advisors → SEMANTIC_SIDE_CAPACITY_INVALID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.participant_policy.min_advisors = 6;
      o.participant_policy.sides.forEach(function (s) { s.max_members = 2; });  // sum max = 4 < 6
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("cap", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_SIDE_CAPACITY_INVALID); });
  });

  /* TEST-27 — 重复 Required Role */
  T.test("TEST-27", "重复 Required Role → SEMANTIC_REQUIRED_ROLE_DUPLICATE", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.required_roles.push({ role_class: "advisor", min_count: 1, max_count: 1 });
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("dup-role", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_REQUIRED_ROLE_DUPLICATE); });
  });

  /* TEST-28 — Role min > max */
  T.test("TEST-28", "Required Role min_count > max_count → SEMANTIC_REQUIRED_ROLE_RANGE_INVALID", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.required_roles.forEach(function (r) { if (r.role_class === "advisor") { r.min_count = 5; r.max_count = 2; } });
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("role-range", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_REQUIRED_ROLE_RANGE_INVALID); });
  });

  /* TEST-29 — Default Visibility 非法 */
  T.test("TEST-29", "default_visibility_mode 不在 allowed 中 → SEMANTIC_DEFAULT_VISIBILITY_NOT_ALLOWED", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.allowed_visibility_modes = ["public"];
      o.default_visibility_mode = "semi_anonymous";   // 不在 allowed 中
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("vis", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_DEFAULT_VISIBILITY_NOT_ALLOWED); });
  });

  /* TEST-30 — Advisor 与 participant_policy 冲突 */
  T.test("TEST-30", "advisor 区间与 participant_policy 无交集 → SEMANTIC_ADVISOR_POLICY_CONFLICT", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      o.participant_policy.min_advisors = 5;
      o.required_roles.forEach(function (r) { if (r.role_class === "advisor") r.max_count = 3; });  // [2,3] ∩ [5,6] = ∅
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("adv-conf", text)])
      .then(function (s) { hasCode(s, C.SEMANTIC_ADVISOR_POLICY_CONFLICT); });
  });

  /* TEST-31 — 多错误一次返回（不 fail-fast） */
  T.test("TEST-31", "多类语义错误应一次返回多条 Diagnostic", function (ctx) {
    var text = F.patch(ctx.validText, function (o) {
      var dup = JSON.parse(JSON.stringify(o.phases[0]));
      dup.phase_id = "opening"; o.phases.push(dup);                       // 重复 phase
      o.phases.forEach(function (p) { if (p.phase_id === "summary") p.transitions[0].target = "nope"; }); // target 不存在
      o.phases.forEach(function (p) { if (p.kind === "human_gate") p.actor.selector = "all_advisors"; }); // human gate 错
      o.participant_policy.sides[0].min_members = 5; o.participant_policy.sides[0].max_members = 1;       // side range 错
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("multi", text)])
      .then(function (s) {
        var ds = s.registry.invalid[0].diagnostics;
        T.assert(ds.length > 1, "应一次返回多条诊断，实际 " + ds.length);
        var set = {};
        ds.forEach(function (d) { set[d.code] = true; });
        T.assert(set[C.SEMANTIC_DUPLICATE_PHASE_ID], "应有重复 phase");
        T.assert(set[C.SEMANTIC_TRANSITION_TARGET_NOT_FOUND], "应有 transition target 不存在");
        T.assert(set[C.SEMANTIC_HUMAN_GATE_ACTOR_INVALID], "应有 human gate actor 错");
        T.assert(set[C.SEMANTIC_SIDE_MEMBER_RANGE_INVALID], "应有 side range 错");
      });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
