/* AI Council v0.1 — MEETING-INTEGRITY-F1-B · Response Validation Pipeline（TEST-226..245，B01..B20）。
 * 核心合同：transport_success ≠ runtime_accepted；runtime_accepted = transport AND validation。
 * strict JSON（整串解析，trailing/leading prose 即 FAIL）+ json_schema + text required_sections。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var OCR = A.OutputContractResolver;

  var OPEN_SCHEMA = { type: "object", required: ["position", "reasons", "risks"],
    properties: { position: { type: "string" }, reasons: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } } }, additionalProperties: false };
  var SUM_SCHEMA = { type: "object", required: ["supporting_points", "opposing_points", "conflicts", "open_questions"],
    properties: { supporting_points: { type: "array", items: { type: "string" } },
      opposing_points: { type: "array", items: { type: "string" } },
      conflicts: { type: "array", items: { type: "string" } },
      open_questions: { type: "array", items: { type: "string" } } }, additionalProperties: false };
  var CRIT_SCHEMA = { type: "object", required: ["challenges"],
    properties: { challenges: { type: "array", items: { type: "string" } } }, additionalProperties: false };
  var BATTLE_SECTIONS = ["claim", "rebuttal", "remaining_uncertainty"];
  var GOOD_JSON = JSON.stringify({ position: "支持", reasons: ["理由一"], risks: ["风险一"] });

  function proto() {
    return { protocolId: "rt-f1b", document: {
      protocol_id: "rt-f1b", version: "0.1.0", name: "校验管线", initial_phase_id: "opening",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }, { role_class: "chair_secretary", min_count: 1, max_count: 1 }],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }],
          output_contract: { mode: "structured_json", json_schema: OPEN_SCHEMA } },
        { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "role_class", role_class: "chair_secretary" },
          completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "critique" }],
          output_contract: { mode: "structured_json", json_schema: SUM_SCHEMA } },
        { phase_id: "critique", kind: "critique", name: "全员挑刺", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }],
          output_contract: { mode: "structured_json", json_schema: CRIT_SCHEMA } },
        { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
          transitions: [{ trigger: "human_choice", choice: "battle", target: "battle" }, { trigger: "human_choice", choice: "finish", target: "$end" }],
          output_contract: { mode: "text", required_sections: ["decision"] } },
        { phase_id: "battle", kind: "battle", name: "正反交锋", actor: { selector: "selected_participants", selection_key: "battle_participants" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }],
          output_contract: { mode: "text", required_sections: BATTLE_SECTIONS } }
      ] } };
  }
  function parts() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "web_relay", model_ref: "claude-web" },
      { participant_id: "agent-a3", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "A3", role_id: "meeting-secretary", seat_id: "A3", transport_kind: "web_relay", model_ref: "chatgpt-web" }
    ];
  }
  function openM() {
    var m = A.MeetingFactory.createMeeting(proto(), { meetingId: "rt-f1b-" + Date.now().toString(36), participants: parts() });
    RT.start(m, proto());
    return m;
  }
  function relayOpen(m, pid) {
    return A.RelayFlow.open(m, proto(), { participantId: pid, registry: { ok: true, findRole: function () { return null; } } });
  }
  function pasteValidate(m, h, raw) {
    A.RelayFlow.receive(m, h, raw);
    return A.RelayFlow.validate(m, h);
  }
  function phaseStatus(m) { return TS.phaseStatus(m, proto()); }

  /* ============ B01..B07：strict structured_json ============ */
  T.test("TEST-226", "B01 完整合法 JSON → PASS 且 normalized_content 为解析对象", function () {
    var vr = OCR.validate(GOOD_JSON, { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(vr.is_valid, "PASS");
    T.assert(vr.normalized_content !== null && vr.normalized_content.position === "支持", "normalized = 解析对象");
    T.assert(vr.schema_errors.length === 0 && vr.missing_sections.length === 0, "无错误");
    return Promise.resolve();
  });

  T.test("TEST-227", "B02 JSON + trailing prose → FAIL（parser_error）", function () {
    var vr = OCR.validate(GOOD_JSON + "\n\n是否需要我补充说明？", { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid && !!vr.parser_error, "FAIL + parser_error");
    T.assert(vr.parser_error.indexOf("JSON 解析失败") >= 0, "错误=解析失败");
    T.assert(vr.normalized_content === null, "FAIL 时 normalized 为 null");
    return Promise.resolve();
  });

  T.test("TEST-228", "B03 JSON + leading prose → FAIL", function () {
    var vr = OCR.validate("好的，我的回答如下：\n" + GOOD_JSON, { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid && !!vr.parser_error, "FAIL + parser_error");
    return Promise.resolve();
  });

  T.test("TEST-229", "B04 缺 required property → FAIL（schema_errors）", function () {
    var vr = OCR.validate(JSON.stringify({ position: "支持" }), { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid, "FAIL");
    T.assert(vr.schema_errors.length >= 1 && vr.schema_errors.join(" ").indexOf("reasons") >= 0, "schema_errors 指出缺 reasons");
    return Promise.resolve();
  });

  T.test("TEST-230", "B05 additionalProperties → FAIL（additional_properties 点名）", function () {
    var vr = OCR.validate(JSON.stringify({ position: "支持", reasons: ["a"], risks: ["b"], extra: 1 }), { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid, "FAIL");
    T.assert(vr.additional_properties.indexOf("extra") >= 0, "additional_properties=[extra]");
    return Promise.resolve();
  });

  T.test("TEST-231", "B06 property 类型错误 → FAIL", function () {
    var vr = OCR.validate(JSON.stringify({ position: "支持", reasons: "不是数组", risks: ["b"] }), { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid && vr.schema_errors.length >= 1, "FAIL + schema_errors");
    return Promise.resolve();
  });

  T.test("TEST-232", "B07 malformed JSON → FAIL（parser_error）", function () {
    var vr = OCR.validate('{"position": "支持",}', { mode: "structured_json", json_schema: OPEN_SCHEMA });
    T.assert(!vr.is_valid && !!vr.parser_error, "FAIL + parser_error");
    return Promise.resolve();
  });

  /* ============ B08..B10：text required_sections ============ */
  T.test("TEST-233", "B08 battle 三小节完整 → PASS", function () {
    var raw = "claim\n自研可行。\n\nrebuttal\n对方低估成本。\n\nremaining_uncertainty\n周期风险未定。";
    var vr = OCR.validate(raw, { mode: "text", required_sections: BATTLE_SECTIONS });
    T.assert(vr.is_valid && vr.missing_sections.length === 0, "PASS");
    T.assert(vr.normalized_content.indexOf("claim") >= 0, "normalized = 归一化文本");
    return Promise.resolve();
  });

  T.test("TEST-234", "B09 缺 rebuttal → FAIL（missing_sections=[rebuttal]）", function () {
    var raw = "claim\n自研可行。\n\nremaining_uncertainty\n周期风险未定。";
    var vr = OCR.validate(raw, { mode: "text", required_sections: BATTLE_SECTIONS });
    T.assert(!vr.is_valid && vr.missing_sections.join(",") === "rebuttal", "missing=[rebuttal]");
    return Promise.resolve();
  });

  T.test("TEST-235", "B10 section 存在但为空 → FAIL", function () {
    var raw = "claim\n自研可行。\n\nrebuttal\n\nremaining_uncertainty\n周期风险未定。";
    var vr = OCR.validate(raw, { mode: "text", required_sections: BATTLE_SECTIONS });
    T.assert(!vr.is_valid && vr.missing_sections.indexOf("rebuttal") >= 0, "空小节视为缺失");
    return Promise.resolve();
  });

  /* ============ B11..B15：Runtime 链（transport ≠ accepted） ============ */
  T.test("TEST-236", "B11 validation FAIL → participant 仍 pending", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    var chk = pasteValidate(m, o.handle, GOOD_JSON + "\n多余文字");
    T.assert(!chk.ok && chk.state === "rejected", "rejected");
    T.assert(chk.checks.some(function (c) { return c.id === "V06" && !c.ok; }), "V06 ❌");
    T.assert(m.pendingAction.receivedParticipantIds.indexOf("agent-a1") < 0, "A1 未入 received");
    return Promise.resolve();
  });

  T.test("TEST-237", "B12 validation FAIL → phase 不完成", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    pasteValidate(m, o.handle, "{bad json");
    T.assert(phaseStatus(m) === "running", "phase 仍 running");
    T.assert(phaseStatus(m) !== "ready_to_advance", "不 READY");
    return Promise.resolve();
  });

  T.test("TEST-238", "B13 retry 后合法输出 → 正常接受", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    pasteValidate(m, o.handle, "{bad json");
    var rt = A.RelayFlow.retry(m, o.handle);
    T.assert(rt.ok && rt.state === "waiting_external", "retry 回到 waiting_external");
    var chk = pasteValidate(m, o.handle, GOOD_JSON);
    T.assert(chk.ok && chk.state === "validated", "合法 JSON validated");
    T.assert(chk.validation && chk.validation.is_valid, "validation.is_valid");
    var acc = A.RelayFlow.accept(m, proto(), o.handle);
    T.assert(acc.ok, "accept 成功");
    T.assert(m.pendingAction.receivedParticipantIds.indexOf("agent-a1") >= 0, "A1 已入 received");
    T.assert(acc.message && acc.message.content.raw_text.indexOf("支持") >= 0, "正式消息内容来自 raw");
    return Promise.resolve();
  });

  T.test("TEST-239", "B14 一席合法一席非法 → phase 不完成", function () {
    var m = openM();
    var oa = relayOpen(m, "agent-a1");
    var chkA = pasteValidate(m, oa.handle, GOOD_JSON);
    T.assert(chkA.ok, "A1 合法");
    var accA = A.RelayFlow.accept(m, proto(), oa.handle);
    T.assert(accA.ok, "A1 accepted");
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, "not json at all");
    T.assert(phaseStatus(m) === "running", "B1 非法 → 不完成");
    T.assert(m.pendingAction.receivedParticipantIds.indexOf("agent-b1") < 0, "B1 未入 received");
    return Promise.resolve();
  });

  T.test("TEST-240", "B15 两席最终全部合法 → phase 才完成", function () {
    var m = openM();
    var oa = relayOpen(m, "agent-a1");
    var chkA = pasteValidate(m, oa.handle, GOOD_JSON);
    T.assert(chkA.ok, "A1 validated");
    var accA = A.RelayFlow.accept(m, proto(), oa.handle);
    T.assert(accA.ok, "A1 accepted");
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, "{bad");
    T.assert(phaseStatus(m) === "running", "B1 非法仍 running");
    A.RelayFlow.retry(m, ob.handle);
    var chkB = pasteValidate(m, ob.handle, GOOD_JSON);
    T.assert(chkB.ok, "B1 修正后 validated");
    var accB = A.RelayFlow.accept(m, proto(), ob.handle);
    T.assert(accB.ok, "B1 accepted");
    T.assert(phaseStatus(m) === "ready_to_advance", "2/2 → READY_TO_ADVANCE");
    return Promise.resolve();
  });

  /* ============ B16..B20：回归 ============ */
  T.test("TEST-241", "B16 Opening 正常（JSON 双席全链）", function () {
    var m = openM();
    var oa = relayOpen(m, "agent-a1");
    T.assert(pasteValidate(m, oa.handle, GOOD_JSON).ok, "A1 合法");
    T.assert(A.RelayFlow.accept(m, proto(), oa.handle).ok, "A1 accepted");
    var ob = relayOpen(m, "agent-b1");
    T.assert(pasteValidate(m, ob.handle, GOOD_JSON).ok, "B1 合法");
    T.assert(A.RelayFlow.accept(m, proto(), ob.handle).ok, "B1 accepted");
    T.assert(phaseStatus(m) === "ready_to_advance", "READY");
    return Promise.resolve();
  });

  T.test("TEST-242", "B17 Summary 正常（秘书 JSON Schema）", function () {
    var m = openM();
    var sum = JSON.stringify({ supporting_points: ["a"], opposing_points: ["b"], conflicts: ["c"], open_questions: ["d"] });
    var oa = relayOpen(m, "agent-a1");
    pasteValidate(m, oa.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), oa.handle);
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), ob.handle);
    T.assert(phaseStatus(m) === "ready_to_advance", "opening ready");
    var ad = RT.advancePhase(m, proto());
    T.assert(ad.ok && m.currentPhaseId === "summary", "进入 summary");
    var os = relayOpen(m, "agent-a3");
    var chk = pasteValidate(m, os.handle, sum);
    T.assert(chk.ok, "秘书 JSON 合法");
    T.assert(chk.validation.normalized_content.supporting_points.length === 1, "normalized 秘书对象");
    T.assert(A.RelayFlow.accept(m, proto(), os.handle).ok, "秘书 accepted");
    return Promise.resolve();
  });

  T.test("TEST-243", "B18 Critique 正常（challenges Schema）", function () {
    var m = openM();
    var crit = JSON.stringify({ challenges: ["成本被低估"] });
    var oa = relayOpen(m, "agent-a1");
    pasteValidate(m, oa.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), oa.handle);
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), ob.handle);
    RT.advancePhase(m, proto());
    var os = relayOpen(m, "agent-a3");
    pasteValidate(m, os.handle, JSON.stringify({ supporting_points: [], opposing_points: [], conflicts: [], open_questions: [] })); A.RelayFlow.accept(m, proto(), os.handle);
    RT.advancePhase(m, proto());
    T.assert(m.currentPhaseId === "critique", "进入 critique");
    var oc = relayOpen(m, "agent-a1");
    T.assert(pasteValidate(m, oc.handle, crit).ok, "critique JSON 合法");
    T.assert(A.RelayFlow.accept(m, proto(), oc.handle).ok, "A1 accepted");
    return Promise.resolve();
  });

  T.test("TEST-244", "B19 Human Gate 不受影响（mock 推进 + 人工决策）", function () {
    var m = openM();
    var oa = relayOpen(m, "agent-a1");
    pasteValidate(m, oa.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), oa.handle);
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), ob.handle);
    RT.advancePhase(m, proto());
    var os = relayOpen(m, "agent-a3");
    pasteValidate(m, os.handle, JSON.stringify({ supporting_points: [], opposing_points: [], conflicts: [], open_questions: [] })); A.RelayFlow.accept(m, proto(), os.handle);
    RT.advancePhase(m, proto());
    var oc = relayOpen(m, "agent-a1");
    pasteValidate(m, oc.handle, JSON.stringify({ challenges: ["x"] })); A.RelayFlow.accept(m, proto(), oc.handle);
    var oc2 = relayOpen(m, "agent-b1");
    pasteValidate(m, oc2.handle, JSON.stringify({ challenges: ["y"] })); A.RelayFlow.accept(m, proto(), oc2.handle);
    T.assert(phaseStatus(m) === "ready_to_advance", "critique ready");
    RT.advancePhase(m, proto());
    T.assert(m.status === "waiting_human" && m.currentPhaseId === "human-decision", "Human Gate 停住");
    var g = A.MeetingStepFlow.humanGateState(m);
    T.assert(g.enabled && g.choices.indexOf("battle") >= 0, "Gate 启用");
    return Promise.resolve();
  });

  T.test("TEST-245", "B20 Battle text contract 生效（缺 rebuttal → V06 拦截）", function () {
    var m = openM();
    var oa = relayOpen(m, "agent-a1");
    pasteValidate(m, oa.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), oa.handle);
    var ob = relayOpen(m, "agent-b1");
    pasteValidate(m, ob.handle, GOOD_JSON); A.RelayFlow.accept(m, proto(), ob.handle);
    RT.advancePhase(m, proto());
    var os = relayOpen(m, "agent-a3");
    pasteValidate(m, os.handle, JSON.stringify({ supporting_points: [], opposing_points: [], conflicts: [], open_questions: [] })); A.RelayFlow.accept(m, proto(), os.handle);
    RT.advancePhase(m, proto());
    var oc = relayOpen(m, "agent-a1");
    pasteValidate(m, oc.handle, JSON.stringify({ challenges: ["x"] })); A.RelayFlow.accept(m, proto(), oc.handle);
    var oc2 = relayOpen(m, "agent-b1");
    pasteValidate(m, oc2.handle, JSON.stringify({ challenges: ["y"] })); A.RelayFlow.accept(m, proto(), oc2.handle);
    RT.advancePhase(m, proto());
    m.stateData = m.stateData || {}; m.stateData.battle_participants = ["agent-a1", "agent-b1"];
    var dec = RT.submitHumanDecision(m, proto(), { choice: "battle" });
    T.assert(dec.ok && m.currentPhaseId === "battle", "进入 battle");
    var ob2 = relayOpen(m, "agent-a1");
    var chk = pasteValidate(m, ob2.handle, "claim\n自研可行。\n\nremaining_uncertainty\n周期未定。");
    T.assert(!chk.ok && chk.validation.missing_sections.indexOf("rebuttal") >= 0, "缺 rebuttal → V06 FAIL");
    T.assert(phaseStatus(m) === "running", "battle 不推进");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
