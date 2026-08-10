/* AI Council v0.1 — MEETING-RUNTIME-F1-T25-F5 · 秘书席位化与 Summary 闭环（TEST-205..217，S01..S13）。
 * 用户裁定：拿六席之一给秘书 AI（role_class=chair_secretary / role_id=meeting-secretary），
 * summary = 正常 1/1 席位阶段，完整复用中继/validated/accept/revoke/replay；不造 System Phase Executor。
 * 三层名单：Physical Seats ≠ Meeting Roster（A1,A3,B1）≠ Phase Roster（opening=[A1,B1]、summary=[A3]）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var RS = A.MeetingResponseState;
  var ADM = A.MeetingAdmission;

  var PROFILE = [
    { model_ref: "chatgpt-web", display_name: "ChatGPT", web_url: "https://chatgpt.com/" },
    { model_ref: "claude-web", display_name: "Claude", web_url: "https://claude.ai/" },
    { model_ref: "gemini-web", display_name: "Gemini", web_url: "https://gemini.google.com/" }
  ];

  /* 本地协议：opening(全员委员) → summary(role_class=chair_secretary) → critique(全员) → human-decision */
  function secProtocol() {
    return { protocolId: "rt-sec", document: {
      protocol_id: "rt-sec", version: "0.1.0", name: "秘书化", initial_phase_id: "opening",
      required_roles: [
        { role_class: "advisor", min_count: 2, max_count: 6 },
        { role_class: "chair_secretary", min_count: 1, max_count: 1 }
      ],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }] },
        { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "role_class", role_class: "chair_secretary" },
          completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "critique" }] },
        { phase_id: "critique", kind: "critique", name: "全员挑刺", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }] },
        { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
          transitions: [{ trigger: "human_choice", choice: "finish", target: "$end" }] }
      ] } };
  }

  /* 1v1 + 秘书：A1 支持方(web_relay) + B1 反对方(mock) + A3 秘书(web_relay, 固定席位 A3) */
  function secParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "mock", model_ref: "claude-web" },
      { participant_id: "agent-a3", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "A3", role_id: "meeting-secretary", seat_id: "A3", transport_kind: "web_relay", model_ref: "chatgpt-web" }
    ];
  }

  function openSec(opts) {
    var m = A.MeetingFactory.createMeeting(secProtocol(), { meetingId: "rt-sec-" + ((opts && opts.id) || "m"), participants: (opts && opts.participants) || secParticipants() });
    RT.start(m, secProtocol());
    return m;
  }
  function speak(m, id) {
    return RT.submitResult(m, secProtocol(), { participant_id: id, payload: { mock: true, participantId: id } });
  }
  function acceptLike(m, id, text) {
    if (!m.messages) m.messages = [];
    m.messages.push({ schema_version: "0.1.0", message_id: "msg-" + id + "-" + m.events.length,
      meeting_id: m.meetingId, phase_id: m.currentPhaseId,
      sender: { actor_type: "agent", actor_id: id, role_id: "advisor", alias: id },
      recipients: { scope: "meeting" }, content: { raw_text: text || ("回答 " + id) },
      validation: { status: "valid", errors: [] }, accepted_by_runtime: true,
      created_at: new Date().toISOString() });
    return speak(m, id);
  }
  function advanceTo(m, phaseId) {
    var guard = 0;
    while (m.currentPhaseId !== phaseId && guard++ < 10) {
      if (TS.phaseStatus(m, secProtocol()) === "ready_to_advance") { var ad = RT.advancePhase(m, secProtocol()); if (!ad.ok) break; }
      else if (m.activeSpeakerId) speak(m, m.activeSpeakerId);
      else break;
    }
  }

  /* ============ S01..S04：三层名单与阶段 roster ============ */
  T.test("TEST-205", "S01 Meeting Roster = A1,A3,B1（秘书占席位）", function () {
    var m = openSec();
    T.assertEqual(m.participants.filter(function (p) { return p.role_class === "chair_secretary"; }).length, 1, "参会名单含秘书");
    T.assertEqual(m.participants.filter(function (p) { return p.participant_id === "agent-a3"; })[0].role_id, "meeting-secretary", "A3 role_id");
    var a3 = m.participants.filter(function (p) { return p.participant_id === "agent-a3"; })[0];
    T.assertEqual(a3.role_class, "chair_secretary", "A3 角色");
    T.assertEqual(a3.role_id, "meeting-secretary", "A3 role_id");
    return Promise.resolve();
  });

  T.test("TEST-206", "S02 opening required=[A1,B1]（秘书被排除）", function () {
    var m = openSec();
    T.assertEqual(TS.getRoundRoster(m).join(","), "agent-a1,agent-b1", "opening 不含秘书");
    T.assertEqual(m.activeSpeakerId, "agent-a1", "A1 先发言");
    return Promise.resolve();
  });

  T.test("TEST-207", "S03/S04 summary required=[A3] 且 2/2 后进入", function () {
    var m = openSec();
    acceptLike(m, "agent-a1", "A1 观点");
    T.assertEqual(TS.phaseStatus(m, secProtocol()), "running", "1/2");
    acceptLike(m, "agent-b1", "B1 观点");
    T.assertEqual(TS.phaseStatus(m, secProtocol()), "ready_to_advance", "2/2");
    var ad = RT.advancePhase(m, secProtocol());
    T.assert(ad.ok, "进入 summary");
    T.assertEqual(m.currentPhaseId, "summary", "阶段");
    T.assertEqual(TS.getRoundRoster(m).join(","), "agent-a3", "summary 仅秘书");
    T.assertEqual(m.activeSpeakerId, "agent-a3", "activeSpeaker=秘书");
    return Promise.resolve();
  });

  /* ============ S05..S07：秘书 Prompt 输入源 ============ */
  T.test("TEST-208", "S05/S06 Secretary 输入 = A1+B1 最新有效正式发言（来源引用）", function () {
    var m = openSec();
    acceptLike(m, "agent-a1", "A1 观点 v1");
    acceptLike(m, "agent-b1", "B1 观点");
    /* A1 修改（V1 superseded → V2） */
    var v1 = RS.latestOfficial(m, "agent-a1");
    var rv = RS.revise(m, secProtocol(), v1.message_id, "A1 观点 v2");
    T.assert(rv.ok, "修改成功");
    var list = RS.effectiveResponses(m);
    T.assertEqual(list.length, 2, "两位委员各一条");
    var a1 = list.filter(function (x) { return x.participant_id === "agent-a1"; })[0];
    T.assertEqual(a1.text, "A1 观点 v2", "只取 V2");
    T.assert(a1.responseId !== v1.message_id, "来源=新 response_id");
    T.assert(list.some(function (x) { return x.participant_id === "agent-b1"; }), "B1 也在");
    T.assert(!list.some(function (x) { return x.participant_id === "agent-a3"; }), "秘书不把自己当来源");
    return Promise.resolve();
  });

  T.test("TEST-209", "S07 revoked 发言不得进入 Secretary 输入", function () {
    var m = openSec();
    acceptLike(m, "agent-a1", "A1 观点");
    var v1 = RS.latestOfficial(m, "agent-a1");
    RS.revoke(m, v1.message_id);
    acceptLike(m, "agent-b1", "B1 观点");
    var list = RS.effectiveResponses(m);
    T.assertEqual(list.length, 1, "A1 已撤回，只剩 B1");
    T.assertEqual(list[0].participant_id, "agent-b1", "来源=B1");
    return Promise.resolve();
  });

  /* ============ S08..S10：秘书 accept/revoke 闭环 ============ */
  T.test("TEST-210", "S08/S09 秘书 validated ≠ received；Accept → 1/1 → READY_TO_ADVANCE", function () {
    var m = openSec();
    advanceTo(m, "summary");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 0, "validated 前 0/1");
    acceptLike(m, "agent-a3", "中立摘要");
    T.assertEqual(TS.phaseStatus(m, secProtocol()), "ready_to_advance", "1/1");
    T.assert(RS.latestOfficial(m, "agent-a3") !== null, "秘书汇总已写入正式记录");
    return Promise.resolve();
  });

  T.test("TEST-211", "S10 秘书 Revoke → 0/1 → RUNNING", function () {
    var m = openSec();
    advanceTo(m, "summary");
    acceptLike(m, "agent-a3", "中立摘要");
    var sum = RS.latestOfficial(m, "agent-a3");
    RS.revoke(m, sum.message_id);
    T.assertEqual(TS.phaseStatus(m, secProtocol()), "running", "撤回回 RUNNING");
    T.assertEqual(TS.deriveCompleted(m).length, 0, "0/1");
    return Promise.resolve();
  });

  /* ============ S11：Replay 一致 ============ */
  T.test("TEST-212", "S11 Replay 后秘书 Official 状态与 Live 一致", function () {
    var m = openSec();
    acceptLike(m, "agent-a1", "A1 观点");
    acceptLike(m, "agent-b1", "B1 观点");
    RT.advancePhase(m, secProtocol());
    acceptLike(m, "agent-a3", "中立摘要");
    var st = A.MeetingReplay.replayStateAt(m, secProtocol(), m.events.length);
    T.assertEqual(st.phase_id, "summary", "回放阶段");
    T.assert(st.received.indexOf("agent-a3") >= 0, "回放中秘书已接收", st.received.join(","));
    T.assertEqual(st.phase_done, false, "1/1 后 phase 未 complete（等人工进入下一阶段）");
    T.assertEqual(st.required.join(","), "agent-a3", "回放 roster 仅秘书");
    return Promise.resolve();
  });

  /* ============ S12/S13：必需角色 Preflight ============ */
  T.test("TEST-213", "S12 无秘书 + Protocol 需要 summary → Preflight BLOCKED", function () {
    var parts = secParticipants().filter(function (p) { return p.role_class !== "chair_secretary"; });
    var m = openSec({ participants: parts });
    var pf = ADM.preflight(m, secProtocol(), PROFILE);
    T.assert(pf.blocked.some(function (b) { return b.roleBlock && b.reason.indexOf("秘书席") >= 0; }), "阻塞原因=缺少秘书", JSON.stringify(pf.blocked));
    return Promise.resolve();
  });

  T.test("TEST-214", "S13 两个秘书 → BLOCKED（只允许一个秘书席）", function () {
    var parts = secParticipants();
    parts.push({ participant_id: "agent-b2", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "B2", role_id: "meeting-secretary", seat_id: "B2", transport_kind: "mock", model_ref: "claude-web" });
    var m = openSec({ participants: parts });
    var pf = ADM.preflight(m, secProtocol(), PROFILE);
    T.assert(pf.blocked.some(function (b) { return b.roleBlock && b.reason.indexOf("只允许一个秘书席") >= 0; }), "阻塞原因=秘书超员", JSON.stringify(pf.blocked));
    return Promise.resolve();
  });

  /* ============ S15：秘书 Prompt 注入（renderer 区块） ============ */
  T.test("TEST-215", "S15 秘书 Prompt 含上一阶段全部有效发言且带来源", function () {
    var m = openSec();
    acceptLike(m, "agent-a1", "A1 观点");
    acceptLike(m, "agent-b1", "B1 观点");
    RT.advancePhase(m, secProtocol());
    var c = A.CompileFlow.run({ protocol: secProtocol(), meeting: m, participantId: "agent-a3", roleRegistry: { ok: true, findRole: function () { return null; } }, packetSchema: null,
      previousResponses: RS.effectiveResponses(m), secretarySummary: null });
    T.assert(c.ok, "编译成功");
    T.assert(c.prompt && c.prompt.indexOf("上一阶段正式发言") >= 0, "含输入区块");
    T.assert(c.prompt.indexOf("A1 观点") >= 0 && c.prompt.indexOf("B1 观点") >= 0, "含 A1+B1 观点");
    T.assert(c.prompt.indexOf("source=") >= 0, "含来源引用");
    return Promise.resolve();
  });

  T.test("TEST-216", "S16 critique 阶段委员 Prompt 共享同一份秘书汇总（shared_context）", function () {
    var m = openSec();
    advanceTo(m, "summary");
    acceptLike(m, "agent-a3", "中立摘要内容");
    RT.advancePhase(m, secProtocol());
    var cA1 = A.CompileFlow.run({ protocol: secProtocol(), meeting: m, participantId: "agent-a1", roleRegistry: { ok: true, findRole: function () { return null; } }, packetSchema: null,
      previousResponses: [], secretarySummary: RS.secretarySummary(m) });
    var cB1 = A.CompileFlow.run({ protocol: secProtocol(), meeting: m, participantId: "agent-b1", roleRegistry: { ok: true, findRole: function () { return null; } }, packetSchema: null,
      previousResponses: [], secretarySummary: RS.secretarySummary(m) });
    T.assert(cA1.ok && cB1.ok, "双方编译成功");
    T.assert(cA1.prompt.indexOf("中立摘要内容") >= 0 && cB1.prompt.indexOf("中立摘要内容") >= 0, "A1 与 B1 收到同一份秘书汇总");
    return Promise.resolve();
  });

  T.test("TEST-217", "S17 席位映射：秘书固定占 A3 卡（side_id=null 也映射）", function () {
    var m = openSec();
    var seats = A.SeatLayout.mapParticipants(m.participants, {});
    var a3 = seats.filter(function (s) { return s.seat_id === "A3"; })[0];
    T.assertEqual(a3.participant_id, "agent-a3", "A3 卡=秘书");
    T.assertEqual(seats.filter(function (s) { return s.seat_id === "A1"; })[0].participant_id, "agent-a1", "A1 卡=支持方");
    T.assertEqual(seats.filter(function (s) { return s.seat_id === "B1"; })[0].participant_id, "agent-b1", "B1 卡=反对方");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
