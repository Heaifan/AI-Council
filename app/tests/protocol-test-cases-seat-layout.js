/* AI Council v0.1 — D3 · 六席会议控制台 · SeatLayout 用例（TEST-155..）。
 * 覆盖：六席固定顺序与立场默认 / mapParticipants 映射稳定 / 空席 / stance 覆盖 /
 * seat_id↔participant_id 绑定 / 六席默认参与者模板 / 冻结后 Draft 不可改（ConsoleActions 无 DOM 部分）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var SL = A.SeatLayout;

  T.test("TEST-155", "六席固定顺序：左 A1..A3（支持）、右 B1..B3（反对）", function () {
    T.assertEqual(SL.SEATS.length, 6, "共 6 席");
    T.assertEqual(SL.SEATS.map(function (s) { return s.seat_id; }).join(","), "A1,A2,A3,B1,B2,B3", "顺序冻结");
    T.assertEqual(SL.SEATS[0].side, "A", "A1 属支持侧");
    T.assertEqual(SL.SEATS[3].side, "B", "B1 属质疑侧");
    T.assertEqual(SL.defaultStanceFor("A"), "support", "A 侧默认支持");
    T.assertEqual(SL.defaultStanceFor("B"), "oppose", "B 侧默认反对");
    T.assertEqual(SL.defaultStanceFor(null), "neutral", "无侧默认中立");
    return Promise.resolve();
  });

  T.test("TEST-156", "mapParticipants：同侧参与者按序占席，不足显示空席", function () {
    var parts = [
      { participant_id: "agent-a1", side_id: "A" },
      { participant_id: "agent-a2", side_id: "A" },
      { participant_id: "agent-b1", side_id: "B" }
    ];
    var seats = SL.mapParticipants(parts, {});
    T.assertEqual(seats.length, 6, "永远 6 席");
    T.assertEqual(seats[0].participant_id, "agent-a1", "A1 席绑定 a1");
    T.assertEqual(seats[1].participant_id, "agent-a2", "A2 席绑定 a2");
    T.assertEqual(seats[2].participant_id, null, "A3 空席");
    T.assertEqual(seats[2].occupied, false, "A3 未占用");
    T.assertEqual(seats[3].participant_id, "agent-b1", "B1 席绑定 b1");
    T.assertEqual(seats[5].occupied, false, "B3 空席");
    return Promise.resolve();
  });

  T.test("TEST-157", "立场覆盖表生效：override 优先于 side 默认", function () {
    var parts = [{ participant_id: "agent-a1", side_id: "A" }, { participant_id: "agent-b1", side_id: "B" }];
    var seats = SL.mapParticipants(parts, { "agent-a1": "oppose", "agent-b1": "support" });
    T.assertEqual(seats[0].stance, "oppose", "A1 被覆盖为反对");
    T.assertEqual(seats[0].stance_text, "反对", "中文立场");
    T.assertEqual(seats[3].stance, "support", "B1 被覆盖为支持");
    return Promise.resolve();
  });

  T.test("TEST-158", "seatIdOf：participant_id → seat_id 双向稳定", function () {
    var parts = SL.sixSeatParticipants();
    var seats = SL.mapParticipants(parts, {});
    T.assertEqual(SL.seatIdOf("agent-a1", seats), "A1", "a1 → A1");
    T.assertEqual(SL.seatIdOf("agent-b3", seats), "B3", "b3 → B3");
    T.assertEqual(SL.seatIdOf("ghost", seats), null, "未占用返回 null");
    T.assertEqual(SL.seatDef("A2").seat_id, "A2", "seatDef 命中");
    T.assertEqual(SL.seatDef("C9"), null, "seatDef 未命中");
    return Promise.resolve();
  });

  T.test("TEST-159", "sixSeatParticipants：六席默认模板含 A1 web_relay + chatgpt-web", function () {
    var parts = SL.sixSeatParticipants();
    T.assertEqual(parts.length, 6, "6 名参与者");
    T.assertEqual(parts[0].participant_id, "agent-a1", "首席 a1");
    T.assertEqual(parts[0].transport_kind, "web_relay", "A1 默认网页中继");
    T.assertEqual(parts[0].model_ref, "chatgpt-web", "A1 默认模型引用");
    T.assertEqual(parts[3].role_id, "risk-challenger", "B1 默认风险挑战者");
    parts.forEach(function (p) {
      T.assert(!Object.prototype.hasOwnProperty.call(p, "web_url"), "模板不得携带 web_url（Transport 配置）");
    });
    return Promise.resolve();
  });

  T.test("TEST-160", "六席模板创建会议：Meeting 携带 6 参与者且 topic 仍入 Packet", function (ctx) {
    var proto = { protocolId: "committee-mvp", document: {
      protocol_id: "committee-mvp", version: "0.1.0", name: "委员会 MVP", initial_phase_id: "opening",
      phases: [{ phase_id: "opening", kind: "agent_turn", name: "开场陈述",
        actor: { selector: "all_advisors" }, completion: { mode: "all_selected_respond" },
        transitions: [{ trigger: "complete", target: "$end" }] }] } };
    var d = A.MeetingDraft.create("committee-mvp");
    d.title = "六席会议";
    d.topic = "六席议题应进入提示词";
    d.participants = SL.sixSeatParticipants();
    var r = A.MeetingDraft.buildMeeting(d, proto, "mtg-six-1");
    T.assert(r.ok, "创建应成功：" + (r.message || ""));
    T.assertEqual(r.meeting.participants.length, 6, "6 名参与者进入会议");
    T.assertEqual(r.meeting.topic, "六席议题应进入提示词", "topic 落库");
    var reg = A.RoleCardRegistry.create([JSON.parse(ctx.roleCardAdvisorText), JSON.parse(ctx.roleCardStrategicAdvocateText)]);
    var compiled = A.InstructionCompiler.compile({
      protocol: proto, meeting: r.meeting, phaseId: "opening", participantId: "agent-a1", roleRegistry: reg
    });
    T.assert(compiled.ok, "编译应 ok：" + (compiled.diagnostics && compiled.diagnostics[0] && compiled.diagnostics[0].message));
    T.assertEqual(compiled.packet.meeting.topic, "六席议题应进入提示词", "packet 携带议题");
    return Promise.resolve();
  });

  /* ---------- F1：席位配置冻结规则（SeatConfigRules，ONE-SCREEN-F1 §七/§八） ---------- */

  T.test("TEST-161", "字段级冻结矩阵：冻结只锁 role_class，model_ref/transport 仍可编辑", function () {
    var R = A.SeatConfigRules;
    T.assert(!R.canEdit(true, "role_class"), "冻结时角色不可编辑");
    T.assert(R.canEdit(true, "model_ref"), "冻结时模型引用可编辑");
    T.assert(R.canEdit(true, "transport_kind"), "冻结时传输方式可编辑");
    T.assert(R.canEdit(false, "role_class"), "未冻结时角色可编辑");
    T.assert(R.canEdit(false, "model_ref"), "未冻结时模型引用可编辑");
    return Promise.resolve();
  });

  T.test("TEST-162", "创建前 applyToParticipant：角色/引用/传输全部可写", function () {
    var p = { participant_id: "agent-a1", role_class: "advisor", model_ref: "chatgpt-web", transport_kind: "web_relay" };
    var r = A.SeatConfigRules.applyToParticipant(p,
      { role_class: "chair_secretary", model_ref: "claude-web", transport_kind: "mock" }, false);
    T.assert(r.ok, "应成功：" + (r.message || ""));
    T.assertEqual(p.role_class, "chair_secretary", "角色已更新");
    T.assertEqual(p.model_ref, "claude-web", "引用已更新");
    T.assertEqual(p.transport_kind, "mock", "传输已更新");
    return Promise.resolve();
  });

  T.test("TEST-163", "创建后 applyToParticipant：角色拒改，引用/传输热改成功", function () {
    var p = { participant_id: "agent-a1", role_class: "advisor", model_ref: "chatgpt-web", transport_kind: "web_relay" };
    var r = A.SeatConfigRules.applyToParticipant(p,
      { role_class: "chair_secretary", model_ref: "claude-web", transport_kind: "mock" }, true);
    T.assert(!r.ok, "角色改动必须被拒绝");
    T.assertEqual(p.role_class, "advisor", "角色未被污染");
    T.assertEqual(p.model_ref, "chatgpt-web", "引用未被污染（整体拒绝）");
    var r2 = A.SeatConfigRules.applyToParticipant(p,
      { role_class: "advisor", model_ref: "claude-web", transport_kind: "mock" }, true);
    T.assert(r2.ok, "引用/传输热改应成功：" + (r2.message || ""));
    T.assertEqual(p.model_ref, "claude-web", "引用已热改");
    T.assertEqual(p.transport_kind, "mock", "传输已热改");
    T.assertEqual(p.role_class, "advisor", "角色保持冻结值");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
