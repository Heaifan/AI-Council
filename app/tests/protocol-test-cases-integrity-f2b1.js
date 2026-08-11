/* AI Council v0.1 — MEETING-INTEGRITY-F2-B1 · Battle Turn Contract（TEST-264..273，B1-01..B1-10）。
 * 核心：两层身份 phase_entry（第几次进入 Battle）× battle_round（本次 Battle 内第几轮交锋，Runtime-owned）；
 *   Battle Slot = phase_id:participant_id:turn:battle_round，非 Battle 保持三元；
 *   battle_round 首次进入 = 1，仅 Runtime 显式 advanceBattleRound 才 +1（绝不因发言/transport/校验自动推导）；
 *   幂等合同保持：同 slot 同 message → NO-OP / 不同 → DUP_SLOT；checkpoint/archive/restore 恢复后不漂移。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var MC = A.MessageCommit;

  var OPEN_SCHEMA = { type: "object", required: ["position", "reasons", "risks"],
    properties: { position: { type: "string" }, reasons: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } } }, additionalProperties: false };
  var GOOD = JSON.stringify({ position: "支持", reasons: ["理由一"], risks: ["风险一"] });
  var BATTLE_TEXT = function (pid) { return "claim\n立场" + pid + "。\n\nrebuttal\n反驳。\n\nremaining_uncertainty\n未知。"; };

  /* 多回合 Battle 协议：直接以 battle 为 initial（phase_entry=1），complete → human-decision，再 battle → 二次进入。 */
  function battleProto() {
    return { protocolId: "rt-f2b1", document: {
      protocol_id: "rt-f2b1", version: "0.1.0", name: "多回合 Battle", initial_phase_id: "battle",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }],
      phases: [
        { phase_id: "battle", kind: "battle", name: "正反交锋", actor: { selector: "selected_participants", selection_key: "battle_participants" },
          completion: { mode: "all_selected_respond" }, checkpoint: true,
          transitions: [{ trigger: "complete", target: "human-decision" }],
          output_contract: { mode: "text", required_sections: ["claim", "rebuttal", "remaining_uncertainty"] } },
        { phase_id: "human-decision", kind: "human_gate", name: "主席裁定", checkpoint: true,
          transitions: [{ trigger: "human_choice", choice: "battle", target: "battle" }, { trigger: "human_choice", choice: "finish", target: "$end" }] }
      ] } };
  }
  function parts() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "web_relay", model_ref: "claude-web" }
    ];
  }
  function openBattle() {
    var m = A.MeetingFactory.createMeeting(battleProto(), { meetingId: "rt-f2b1-" + Date.now().toString(36), participants: parts() });
    m.stateData = m.stateData || {}; m.stateData.battle_participants = ["agent-a1", "agent-b1"];
    RT.start(m, battleProto());
    return m;
  }
  function acceptBattle(m, pid) {
    var o = A.RelayFlow.open(m, battleProto(), { participantId: pid, registry: { ok: true, findRole: function () { return null; } } });
    A.RelayFlow.receive(m, o.handle, BATTLE_TEXT(pid));
    var chk = A.RelayFlow.validate(m, o.handle);
    T.assert(chk.ok, pid + " battle validate 通过");
    return A.RelayFlow.accept(m, battleProto(), o.handle);
  }

  /* ============ B1-01 / B1-02 / B1-03：回合身份 ============ */
  T.test("TEST-264", "B1-01 第一次进入 Battle → battle_round=1；未完成时拒绝开新回合", function () {
    var m = openBattle();
    T.assertEqual(m.pendingAction.battle_round, 1, "首次进入 battle → battle_round=1");
    T.assertEqual(m.pendingAction.phase_entry, 1, "phase_entry=1");
    var r = RT.advanceBattleRound(m, battleProto());
    T.assert(!r.ok, "0/2 未完成 → 拒绝开新回合（不能自动 +1）");
    return Promise.resolve();
  });

  T.test("TEST-265", "B1-02 A1/B1 Round1：slot 互异且各自可 commit（消息带 battle_round=1）", function () {
    var m = openBattle();
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    T.assertEqual((m.messages || []).length, 2, "两条正式 commit");
    T.assertEqual(MC.battleRoundOf(m.messages[0]), 1, "msg0 battle_round=1");
    T.assertEqual(MC.battleRoundOf(m.messages[1]), 1, "msg1 battle_round=1");
    T.assert(MC.slotKey("battle", "agent-a1", 1, 1) !== MC.slotKey("battle", "agent-b1", 1, 1), "slot(A1) != slot(B1)");
    T.assertEqual(TS.phaseStatus(m, battleProto()), "ready_to_advance", "2/2 → READY");
    return Promise.resolve();
  });

  T.test("TEST-266", "B1-03 同 A1 Round1/Round2 slot 不冲突；A1 发言后未收齐不自动开新轮", function () {
    var m = openBattle();
    var a1r1 = acceptBattle(m, "agent-a1");
    var r1 = RT.advanceBattleRound(m, battleProto());
    T.assert(!r1.ok, "1/2（A1 已发言）→ 拒绝开新回合（发言/transport 不得推导 round）");
    acceptBattle(m, "agent-b1");
    var r2 = RT.advanceBattleRound(m, battleProto());
    T.assert(r2.ok && r2.battle_round === 2, "2/2 → Runtime 显式开新回合 round=2");
    T.assertEqual(m.pendingAction.battle_round, 2, "Runtime battle_round=2");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 0, "received 重置（新轮重新收集）");
    T.assertEqual(TS.phaseStatus(m, battleProto()), "running", "新轮 → running（不误判完成）");
    var a1r2 = acceptBattle(m, "agent-a1");
    T.assertEqual((m.messages || []).length, 3, "A1 round2 落库 → 3 条");
    T.assertEqual(MC.battleRoundOf(a1r2.message), 2, "round2 消息 battle_round=2");
    T.assert(MC.slotKey("battle", "agent-a1", 1, 1) !== MC.slotKey("battle", "agent-a1", 1, 2), "round1/round2 slot 不冲突");
    T.assert(MC.findCommitted(m, "battle", "agent-a1", 1, 1).message_id === a1r1.message.message_id, "round1 slot 仍指向 round1 消息");
    T.assert(MC.findCommitted(m, "battle", "agent-a1", 1, 2).message_id === a1r2.message.message_id, "round2 slot 指向 round2 消息");
    return Promise.resolve();
  });

  /* ============ B1-04 / B1-05：幂等合同 ============ */
  T.test("TEST-267", "B1-04 Round1 同一 message 重放 → NO-OP（不重复落库）", function () {
    var m = openBattle();
    var acc = acceptBattle(m, "agent-a1");
    var cm = MC.commit(m, acc.message);
    T.assert(cm.ok && cm.noop === true, "重放 → NO-OP");
    T.assertEqual((m.messages || []).length, 1, "仍 1 条");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 1, "received 不重复");
    return Promise.resolve();
  });

  T.test("TEST-268", "B1-05 Round1 相同 slot 写入另一 message → DUP_SLOT 拒绝", function () {
    var m = openBattle();
    var acc = acceptBattle(m, "agent-a1");
    var other = JSON.parse(JSON.stringify(acc.message));
    other.message_id = "msg-other-" + m.events.length;
    other.content.raw_text = "不同内容";
    var cm = MC.commit(m, other);
    T.assert(!cm.ok && cm.code === MC.DUP_SLOT, "拒绝覆盖：" + cm.code);
    T.assertEqual((m.messages || []).length, 1, "正式事实不被覆盖");
    return Promise.resolve();
  });

  /* ============ B1-06 / B1-07：持久化与轮次推进 ============ */
  T.test("TEST-269", "B1-06 Checkpoint/Archive/Restore 位于 Round2 A1 完成 B1 未完成 → 恢复后不漂移", function () {
    var m = openBattle();
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    RT.advanceBattleRound(m, battleProto());
    acceptBattle(m, "agent-a1");   /* Round2：A1 已完成 */
    A.MeetingCheckpoint.create(m, { phaseKind: "battle", pendingActionType: "collect_responses" });
    return A.MeetingArchive.build(m, battleProto()).then(function (archive) {
      var cp = archive.checkpoints[archive.checkpoints.length - 1];
      T.assertEqual(cp.state_snapshot.pending_action.battle_round, 2, "checkpoint 快照含 battle_round=2");
      var restored = A.MeetingRestore.restore(archive);
      T.assertEqual(restored.pendingAction.battle_round, 2, "restore 后 battle_round=2（不多开一轮）");
      T.assertEqual(restored.pendingAction.receivedParticipantIds.join(","), "agent-a1", "restore 后 received=[A1]");
      T.assert(MC.isSatisfied(restored, "battle", "agent-a1", restored.pendingAction.phase_entry, 2), "A1 round2 slot satisfied");
      T.assertEqual(TS.derivePending(restored).join(","), "agent-b1", "B1 仍 pending");
      T.assertEqual(TS.phaseStatus(restored, battleProto()), "running", "phaseStatus running（未完成）");
      var r = RT.advanceBattleRound(restored, battleProto());
      T.assert(!r.ok, "恢复后 B1 未完成 → 不能开下一轮（round 不漂移）");
      var o2 = A.RelayFlow.open(restored, battleProto(), { participantId: "agent-b1", registry: { ok: true, findRole: function () { return null; } } });
      A.RelayFlow.receive(restored, o2.handle, BATTLE_TEXT("agent-b1"));
      A.RelayFlow.validate(restored, o2.handle);
      var acc = A.RelayFlow.accept(restored, battleProto(), o2.handle);
      T.assert(acc.ok, "restore 后 B1 补交 round2 成功");
      T.assertEqual(MC.battleRoundOf(acc.message), 2, "补交消息 battle_round=2");
      T.assertEqual(TS.phaseStatus(restored, battleProto()), "ready_to_advance", "2/2 → READY（恢复点可继续推进）");
      return Promise.resolve();
    });
  });

  T.test("TEST-270", "B1-07 完成 Round2 后进入 Round3 → 不误判 Round1/2 slot 已满足", function () {
    var m = openBattle();
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    RT.advanceBattleRound(m, battleProto());
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    T.assertEqual(TS.phaseStatus(m, battleProto()), "ready_to_advance", "round2 完成 → READY");
    var r = RT.advanceBattleRound(m, battleProto());
    T.assert(r.ok && r.battle_round === 3, "进入 round3");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 0, "round3 received 清空");
    T.assertEqual(TS.phaseStatus(m, battleProto()), "running", "round3 → running（Round1/2 不误判已满足）");
    T.assertEqual(TS.derivePending(m).join(","), "agent-a1,agent-b1", "pending=[A1,B1]");
    var a1r3 = acceptBattle(m, "agent-a1");
    T.assertEqual(MC.battleRoundOf(a1r3.message), 3, "round3 消息 battle_round=3");
    T.assert(MC.findCommitted(m, "battle", "agent-a1", 1, 3).message_id === a1r3.message.message_id, "round3 slot 独立于 round1/2");
    T.assertEqual((m.messages || []).length, 5, "总 5 条（2+2+1）");
    return Promise.resolve();
  });

  T.test("TEST-271", "B1-08 离开 Battle → Human Gate → 再次进入 Battle：新 phase_entry 与旧 Battle 不冲突", function () {
    var m = openBattle();
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    RT.advancePhase(m, battleProto());
    T.assertEqual(m.currentPhaseId, "human-decision", "进入 human gate");
    var dec = RT.submitHumanDecision(m, battleProto(), { choice: "battle" });
    T.assert(dec.ok, "再次进入 battle");
    T.assertEqual(m.pendingAction.phase_entry, 2, "第二次进入 battle → phase_entry=2");
    T.assertEqual(m.pendingAction.battle_round, 1, "新 Battle 从头开始 → battle_round=1");
    var a1 = acceptBattle(m, "agent-a1");
    T.assertEqual(MC.turnOf(a1.message), 2, "新 Battle 消息 turn=2");
    T.assertEqual(MC.battleRoundOf(a1.message), 1, "新 Battle 消息 round=1");
    T.assert(MC.slotKey("battle", "agent-a1", 1, 1) !== MC.slotKey("battle", "agent-a1", 2, 1), "新旧 Battle slot 不冲突");
    T.assertEqual((m.messages || []).length, 3, "共 3 条");
    return Promise.resolve();
  });

  /* ============ B1-09 / B1-10：非 Battle 回归与未误写 ============ */
  T.test("TEST-272", "B1-09 Opening/Summary/Critique 回归：Slot 行为与 F1-C 完全一致", function () {
    var p = { protocolId: "rt-f2b1-open", document: {
      protocol_id: "rt-f2b1-open", version: "0.1.0", name: "回归", initial_phase_id: "opening",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "$end" }],
          output_contract: { mode: "structured_json", json_schema: OPEN_SCHEMA } }
      ] } };
    var m = A.MeetingFactory.createMeeting(p, { meetingId: "rt-f2b1o-" + Date.now().toString(36), participants: parts() });
    RT.start(m, p);
    T.assert(m.pendingAction.battle_round === undefined, "非 Battle 无 battle_round 状态");
    var o = A.RelayFlow.open(m, p, { participantId: "agent-a1", registry: { ok: true, findRole: function () { return null; } } });
    A.RelayFlow.receive(m, o.handle, GOOD);
    var chk = A.RelayFlow.validate(m, o.handle);
    T.assert(chk.ok, "validate 通过");
    var acc = A.RelayFlow.accept(m, p, o.handle);
    T.assert(acc.message.extensions.battle_round === undefined, "非 Battle 消息不写 battle_round");
    T.assertEqual(MC.slotKey("opening", "agent-a1", 1), "opening:agent-a1:1", "三元 slotKey 不变");
    var cm = MC.commit(m, acc.message);
    T.assert(cm.ok && cm.noop === true, "重放 → NO-OP");
    var other = JSON.parse(JSON.stringify(acc.message));
    other.message_id = "msg-x"; other.content.raw_text = "y";
    var cm2 = MC.commit(m, other);
    T.assert(!cm2.ok && cm2.code === MC.DUP_SLOT, "DUP_SLOT 保持");
    /* Summary/Critique：全 mock 跑完整多阶段，断言非 battle 消息零 battle_round（全量门禁另锁 F1-C 语义） */
    var p2 = { protocolId: "rt-f2b1-multi", document: {
      protocol_id: "rt-f2b1-multi", version: "0.1.0", name: "多阶段", initial_phase_id: "opening",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }, { role_class: "chair_secretary", min_count: 1, max_count: 1 }],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }],
          output_contract: { mode: "structured_json", json_schema: OPEN_SCHEMA } },
        { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "role_class", role_class: "chair_secretary" },
          completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "critique" }],
          output_contract: { mode: "structured_json", json_schema: { type: "object", required: ["supporting_points"], properties: { supporting_points: { type: "array", items: { type: "string" } } }, additionalProperties: false } } },
        { phase_id: "critique", kind: "critique", name: "全员挑刺", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "$end" }],
          output_contract: { mode: "structured_json", json_schema: { type: "object", required: ["challenges"], properties: { challenges: { type: "array", items: { type: "string" } } }, additionalProperties: false } } }
      ] } };
    var pts = parts().concat([{ participant_id: "agent-a3", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "A3", transport_kind: "web_relay", model_ref: "chatgpt-web" }]);
    var m2 = A.MeetingFactory.createMeeting(p2, { meetingId: "rt-f2b1m-" + Date.now().toString(36), participants: pts });
    RT.start(m2, p2);
    A.MockAgentRuntime.runOnce(RT, m2, p2);
    T.assertEqual(m2.status, "completed", "多阶段跑完");
    (m2.messages || []).forEach(function (msg) {
      T.assertEqual(MC.battleRoundOf(msg), 0, msg.phase_id + " 消息无 battle_round（" + msg.sender.actor_id + "）");
    });
    return Promise.resolve();
  });

  T.test("TEST-273", "B1-10 human_decision_context 恒 null（本轮未误写）", function () {
    var m = openBattle();
    T.assert(m.pendingAction.phase_context && m.pendingAction.phase_context.human_decision_context === null,
      "进入 battle 后 human_decision_context=null");
    acceptBattle(m, "agent-a1");
    acceptBattle(m, "agent-b1");
    RT.advanceBattleRound(m, battleProto());
    T.assert(m.pendingAction.phase_context.human_decision_context === null,
      "battle round2 后 human_decision_context 仍 null");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
