/* AI Council v0.1 — D1-R4 用例：Event Log / Checkpoint / Single JSON Persistence / Restore。
 * 覆盖 JSON 安全、Canonical Fingerprint、Event、Checkpoint、Archive、Schema 校验、
 * Restore 语义校验，以及 Save→Destroy→Load→Continue→$end 三条端到端（TEST-82/83/84）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;
  var RT = A.MeetingRuntime;
  var MOCK = A.MockAgentRuntime;
  var FACTORY = A.MeetingFactory;
  var FP = A.ProtocolFingerprint;
  var Archive = A.MeetingArchive;
  var MSV = A.MeetingSchemaValidator;
  var MRV = A.MeetingRestoreValidator;
  var Persist = A.MeetingPersistence;
  var Restore = A.MeetingRestore;

  /* 注入固定时钟：保证 occurred_at 确定性，便于 append-only 等测试。 */
  A.MeetingEventLog.setClock(function () { return "2026-08-07T17:29:00+08:00"; });

  /* ---------- 助手 ---------- */

  function committeeParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary" }
    ];
  }

  function schemaPack(ctx) {
    return {
      meeting: JSON.parse(ctx.meetingSchemaText),
      role: JSON.parse(ctx.roleSchemaText),
      message: JSON.parse(ctx.messageSchemaText),
      artifact: JSON.parse(ctx.artifactSchemaText),
      annotation: JSON.parse(ctx.annotationSchemaText)
    };
  }

  function committeeProto(ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)])
      .then(function (s) { return s.registry.available[0]; });
  }

  function committeeAvailable(ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)])
      .then(function (s) { return s.registry.available; });
  }

  function startCommittee(ctx) {
    return committeeProto(ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, { meetingId: "rt-p", participants: committeeParticipants() });
      RT.start(m, proto);
      return { proto: proto, m: m };
    });
  }

  function reachHuman(proto, m) {
    MOCK.runOnce(RT, m, proto);
    MOCK.runOnce(RT, m, proto);
    MOCK.runOnce(RT, m, proto);
  }

  function codes(rv) { return rv.diagnostics.map(function (d) { return d.code; }); }

  /* 自定义协议构造（用于 Checkpoint / Fingerprint 定向测试） */
  function tr(trigger, target, choice) {
    var t = { trigger: trigger, target: target };
    if (choice !== undefined) t.choice = choice;
    return t;
  }
  function mkPhase(id, kind, actor, completion, transitions, checkpoint) {
    return {
      phase_id: id, name: id, kind: kind, actor: actor,
      instruction: { task: "t", context_scope: "meeting", include_role_card: false, include_visibility_rules: false },
      output_contract: { mode: "text" },
      completion: { mode: completion },
      checkpoint: checkpoint,
      transitions: transitions
    };
  }
  function mkDoc(phases) {
    return {
      schema_version: "0.1.0", protocol_id: "cp-test", name: "cp", version: "0.1.0",
      source: "built_in", lifecycle_status: "formal", description: "x",
      default_visibility_mode: "semi_anonymous", allowed_visibility_modes: ["public", "semi_anonymous", "full_anonymous"],
      participant_policy: { min_advisors: 2, max_advisors: 6, sides: [
        { side_id: "A", label: "A", min_members: 1, max_members: 3 },
        { side_id: "B", label: "B", min_members: 1, max_members: 3 }
      ] },
      required_roles: [
        { role_class: "advisor", min_count: 2, max_count: 6 },
        { role_class: "chair_secretary", min_count: 1, max_count: 1 }
      ],
      initial_phase_id: "p1",
      phases: phases
    };
  }
  function mkSimpleDoc() {
    return mkDoc([
      mkPhase("p1", "agent_turn", { selector: "all_advisors" }, "all_selected_respond", [tr("complete", "p2")], false),
      mkPhase("p2", "secretary_summary", { selector: "role_class", role_class: "chair_secretary" }, "secretary_respond", [tr("complete", "$end")], false)
    ]);
  }
  function availableFromDoc(doc, ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry(doc.protocol_id, JSON.stringify(doc))])
      .then(function (s) {
        if (s.registry.counts.available !== 1) {
          throw new Error("availableFromDoc: diagnostics=" + JSON.stringify(s.registry.diagnostics.map(function (d) { return d.code; })));
        }
        return s.registry.available[0];
      });
  }

  /* ================= TEST-54 JSON 安全 ================= */

  T.test("TEST-54", "Meeting State 完全 JSON-safe（stringify→parse 无损）", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var m2 = JSON.parse(JSON.stringify(r.m));
      T.assertEqual(m2.status, r.m.status, "status 无损");
      T.assertEqual(m2.currentPhaseId, r.m.currentPhaseId, "currentPhaseId 无损");
      T.assertEqual(m2.completedPhaseIds.length, r.m.completedPhaseIds.length, "completedPhaseIds 无损");
      T.assertEqual(m2.participants.length, r.m.participants.length, "participants 无损");
      T.assertEqual(m2.events.length, r.m.events.length, "events 无损");
      T.assertEqual(m2.checkpoints.length, r.m.checkpoints.length, "checkpoints 无损");
      T.assert(m2.pendingAction && m2.pendingAction.action_type === "await_human_decision", "pendingAction 无损");
    });
  });

  /* ================= TEST-55~60 Event 类型 ================= */

  T.test("TEST-55", "start 产生唯一 meeting_started", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      var c = r.m.events.filter(function (e) { return e.event_type === "meeting_started"; }).length;
      T.assertEqual(c, 1, "meeting_started 恰好 1 条");
    });
  });

  T.test("TEST-56", "进入 opening 记录 phase_entered", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      var has = r.m.events.some(function (e) { return e.event_type === "phase_entered" && e.phase_id === "opening"; });
      T.assert(has, "opening 的 phase_entered 存在");
    });
  });

  T.test("TEST-57", "Agent 响应记录 agent_output_received", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var c = r.m.events.filter(function (e) { return e.event_type === "agent_output_received"; }).length;
      T.assert(c >= 1, "至少一条 agent_output_received");
    });
  });

  T.test("TEST-58", "Phase 完成记录 phase_completed", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      T.assert(r.m.events.some(function (e) { return e.event_type === "phase_completed"; }), "phase_completed 存在");
    });
  });

  T.test("TEST-59", "Human Decision 记录 human_decision", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var ok = RT.submitHumanDecision(r.m, r.proto, { choice: "continue" });
      T.assert(ok.ok, "continue 成功");
      T.assert(r.m.events.some(function (e) { return e.event_type === "human_decision" && e.payload.choice === "continue"; }),
        "human_decision(continue) 已记录");
    });
  });

  T.test("TEST-60", "$end 记录 meeting_completed", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      RT.submitHumanDecision(r.m, r.proto, { choice: "finish" });
      T.assertEqual(r.m.status, "completed", "状态 completed");
      T.assert(r.m.events.some(function (e) { return e.event_type === "meeting_completed"; }), "meeting_completed 已记录");
    });
  });

  /* ================= TEST-61~62 Event Seq / Append-only ================= */

  T.test("TEST-61", "events[].seq 严格连续 0..N-1", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      T.assert(r.m.events.every(function (e, i) { return e.seq === i; }), "seq 连续且等于下标");
    });
  });

  T.test("TEST-62", "Event Log append-only：旧事件内容不变", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var before = JSON.stringify(r.m.events);
      var k = r.m.events.length;
      RT.submitHumanDecision(r.m, r.proto, { choice: "continue" });
      var afterPrefix = JSON.stringify(r.m.events.slice(0, k));
      T.assertEqual(afterPrefix, before, "前 " + k + " 条事件内容完全不变");
    });
  });

  /* ================= TEST-63~66 Checkpoint ================= */

  T.test("TEST-63", "checkpoint=true Phase 进入自动建 Checkpoint（checkpoint=false 不建）", function (ctx) {
    var doc = mkDoc([
      mkPhase("p1", "agent_turn", { selector: "all_advisors" }, "all_selected_respond", [tr("complete", "p2")], false),
      mkPhase("p2", "secretary_summary", { selector: "role_class", role_class: "chair_secretary" }, "secretary_respond", [tr("complete", "$end")], true)
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, { meetingId: "cp1", participants: committeeParticipants() });
      RT.start(m, proto);          /* 进入 p1（checkpoint=false） */
      MOCK.runOnce(RT, m, proto);  /* p1 完成 → 进入 p2（checkpoint=true） */
      T.assertEqual(m.checkpoints.length, 1, "仅 p2(checkpoint=true) 产生 1 个 Checkpoint");
    });
  });

  T.test("TEST-64", "Checkpoint.at_event_seq 对应 checkpoint_created Event", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var cp = r.m.checkpoints[r.m.checkpoints.length - 1];
      var ev = r.m.events[cp.at_event_seq];
      T.assertEqual(ev.event_type, "checkpoint_created", "at_event_seq 指向 checkpoint_created");
      T.assertEqual(ev.payload.checkpoint_id, cp.checkpoint_id, "checkpoint_id 对应");
    });
  });

  T.test("TEST-65", "Checkpoint Deep Copy：后续状态变化不影响旧快照", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var cp = r.m.checkpoints[r.m.checkpoints.length - 1];
      var before = JSON.stringify(cp.state_snapshot.state_data);
      r.m.stateData.battle_participants = ["x"];
      T.assertEqual(JSON.stringify(cp.state_snapshot.state_data), before, "Checkpoint 快照不随后续 stateData 变化");
    });
  });

  T.test("TEST-66", "Human Gate 必须存在 waiting_human 快照", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var found = r.m.checkpoints.some(function (cp) {
        return cp.state_snapshot.status === "waiting_human" &&
          cp.state_snapshot.current_phase_id === "human-decision" &&
          cp.state_snapshot.pending_action && cp.state_snapshot.pending_action.action_type === "await_human_decision";
      });
      T.assert(found, "存在 waiting_human / human-decision / await_human_decision 的 Checkpoint");
    });
  });

  /* ================= TEST-67~68 Canonical Fingerprint ================= */

  T.test("TEST-67", "Canonical Hash：不同 Key 顺序产出相同指纹", function (ctx) {
    var a = { b: 2, a: 1, nested: { z: 1, y: 2 } };
    var b = { a: 1, nested: { y: 2, z: 1 }, b: 2 };
    T.assertEqual(FP.canonicalJSON(a), FP.canonicalJSON(b), "Canonical 序列化与 Key 顺序无关");
    return FP.sha256Canonical(a).then(function (ha) {
      return FP.sha256Canonical(b).then(function (hb) {
        T.assertEqual(ha, hb, "SHA-256 相同");
        T.assertEqual(ha.length, 64, "SHA-256 为 64 位十六进制");
      });
    });
  });

  T.test("TEST-68", "修改 transition target → 指纹变化", function (ctx) {
    var base = mkSimpleDoc();
    var mutated = mkSimpleDoc();
    mutated.phases[0].transitions[0].target = "other";
    return FP.sha256Canonical(base).then(function (h1) {
      return FP.sha256Canonical(mutated).then(function (h2) {
        T.assert(h1 !== h2, "内容不同 → 指纹不同");
      });
    });
  });

  /* ================= TEST-69~73 Archive / Schema / Serialize ================= */

  T.test("TEST-69", "Archive Builder 产出完整必要字段", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        T.assertEqual(archive.schema_version, "0.1.0", "schema_version");
        T.assert(/^[a-f0-9]{64}$/.test(archive.protocol_snapshot.sha256), "sha256 64 位");
        T.assert(Array.isArray(archive.roles), "roles 数组");
        T.assertEqual(archive.participants.length, 3, "participants=3");
        T.assert(archive.events.length > 0, "events 非空");
        T.assert(archive.checkpoints.length > 0, "checkpoints 非空");
        T.assertEqual(archive.status, "waiting_human", "status");
        T.assertEqual(archive.current_phase_id, "human-decision", "current_phase_id");
      });
    });
  });

  T.test("TEST-70", "Future Arrays 为空（messages/artifacts/annotations=[]，branch=null）", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        T.assertEqual(archive.messages.length, 0, "messages=[]");
        T.assertEqual(archive.artifacts.length, 0, "artifacts=[]");
        T.assertEqual(archive.annotations.length, 0, "annotations=[]");
        T.assertEqual(archive.branch, null, "branch=null");
      });
    });
  });

  T.test("TEST-71", "Archive 通过 meeting.schema.json 校验", function (ctx) {
    var pack = schemaPack(ctx);
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        var sv = MSV.create(pack);
        T.assert(sv.ok, "Schema Pack 编译成功");
        var res = sv.validate(archive);
        T.assert(res.ok, "Archive Schema 校验 PASS");
      });
    });
  });

  T.test("TEST-72", "删除 protocol_snapshot → Schema FAIL", function (ctx) {
    var pack = schemaPack(ctx);
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        delete archive.protocol_snapshot;
        var res = MSV.create(pack).validate(archive);
        T.assert(!res.ok, "Schema 校验应 FAIL");
        T.assertEqual(res.diagnostics[0].code, "SCHEMA_VALIDATION_FAILED", "诊断码 SCHEMA_VALIDATION_FAILED");
      });
    });
  });

  T.test("TEST-73", "Serialize → Parse 数据等价", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        var p = Persist.parse(Persist.serialize(archive));
        T.assert(p.ok, "parse 成功");
        T.assertEqual(JSON.stringify(p.value), JSON.stringify(archive), "往返等价");
      });
    });
  });

  /* ================= TEST-74~81 Restore ================= */

  T.test("TEST-74", "Save→Restore 恢复 waiting_human / human-decision", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        var m2 = Restore.restore(archive);
        T.assertEqual(m2.status, "waiting_human", "恢复 status");
        T.assertEqual(m2.currentPhaseId, "human-decision", "恢复 currentPhaseId");
        T.assert(m2.pendingAction && m2.pendingAction.action_type === "await_human_decision", "恢复 pendingAction");
      });
    });
  });

  T.test("TEST-75", "部分响应 Restore 后只等待剩余参与者", function (ctx) {
    return committeeProto(ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, { meetingId: "pr", participants: committeeParticipants() });
      RT.start(m, proto);
      RT.submitResult(m, proto, { participant_id: "agent-a1", payload: { mock: true, participantId: "agent-a1" } });
      return Archive.build(m, proto).then(function (archive) {
        T.assertEqual(archive.pending_action.receivedParticipantIds.length, 1, "archive 记录 1 条已收");
        T.assertEqual(archive.pending_action.receivedParticipantIds[0], "agent-a1", "已收 agent-a1");
        var m2 = Restore.restore(archive);
        T.assertEqual(m2.pendingAction.receivedParticipantIds.length, 1, "恢复后 received=1");
        var ok = RT.submitResult(m2, proto, { participant_id: "agent-b1", payload: { mock: true, participantId: "agent-b1" } });
        T.assert(ok.ok, "提交 B1 成功（Runtime 只等待 B1）");
        T.assertEqual(m2.currentPhaseId, "summary", "两人都响应后推进到 summary");
      });
    });
  });

  T.test("TEST-76", "引用不存在的 Protocol → RESTORE_PROTOCOL_NOT_FOUND", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        return MRV.validate(archive, []).then(function (rv) {
          T.assert(!rv.ok, "应拒绝");
          T.assert(codes(rv).indexOf("RESTORE_PROTOCOL_NOT_FOUND") >= 0, "RESTORE_PROTOCOL_NOT_FOUND");
        });
      });
    });
  });

  T.test("TEST-77", "Protocol 内容改动（同 id+version）→ RESTORE_PROTOCOL_FINGERPRINT_MISMATCH", function (ctx) {
    var origText = ctx.validText;
    var mutated = JSON.parse(origText);
    /* 真实内容改动：改写 opening 的指令文本（仍然 Schema + Semantic 合法，
     * 但 Canonical JSON 不同 → SHA-256 指纹必然变化）。 */
    mutated.phases[0].instruction.task = "已被第三方篡改的任务指令。";
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", origText)]).then(function (s0) {
      var proto0 = s0.registry.available[0];
      return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", JSON.stringify(mutated))]).then(function (s1) {
        var mutatedProto = s1.registry.available[0];
        var m = FACTORY.createMeeting(proto0, { meetingId: "fp", participants: committeeParticipants() });
        RT.start(m, proto0);
        reachHuman(proto0, m);
        return Archive.build(m, proto0).then(function (archive) {
          return MRV.validate(archive, [mutatedProto]).then(function (rv) {
            T.assert(!rv.ok, "应拒绝");
            T.assert(codes(rv).indexOf("RESTORE_PROTOCOL_FINGERPRINT_MISMATCH") >= 0, "指纹不一致");
          });
        });
      });
    });
  });

  T.test("TEST-78", "Event seq 不连续 → RESTORE_EVENT_SEQUENCE_INVALID", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        archive.events[1].seq = 999;
        return committeeAvailable(ctx).then(function (avail) {
          return MRV.validate(archive, avail).then(function (rv) {
            T.assert(!rv.ok, "应拒绝");
            T.assert(codes(rv).indexOf("RESTORE_EVENT_SEQUENCE_INVALID") >= 0, "EVENT_SEQUENCE_INVALID");
          });
        });
      });
    });
  });

  T.test("TEST-79", "Checkpoint at_event_seq 越界 → RESTORE_CHECKPOINT_EVENT_NOT_FOUND", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        archive.checkpoints[archive.checkpoints.length - 1].at_event_seq = 9999;
        return committeeAvailable(ctx).then(function (avail) {
          return MRV.validate(archive, avail).then(function (rv) {
            T.assert(!rv.ok, "应拒绝");
            T.assert(codes(rv).indexOf("RESTORE_CHECKPOINT_EVENT_NOT_FOUND") >= 0, "CHECKPOINT_EVENT_NOT_FOUND");
          });
        });
      });
    });
  });

  T.test("TEST-80", "status=waiting_human 但当前 phase 非 human_gate → RESTORE_STATE_INCONSISTENT", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        archive.status = "waiting_human";
        archive.current_phase_id = "opening";
        return committeeAvailable(ctx).then(function (avail) {
          return MRV.validate(archive, avail).then(function (rv) {
            T.assert(!rv.ok, "应拒绝");
            T.assert(codes(rv).indexOf("RESTORE_STATE_INCONSISTENT") >= 0, "STATE_INCONSISTENT");
          });
        });
      });
    });
  });

  T.test("TEST-81", "Restore completed 会议：不重新 start", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      RT.submitHumanDecision(r.m, r.proto, { choice: "finish" });
      T.assertEqual(r.m.status, "completed", "completed");
      return Archive.build(r.m, r.proto).then(function (archive) {
        var m2 = Restore.restore(archive);
        T.assertEqual(m2.status, "completed", "恢复 completed");
        T.assertEqual(m2.currentPhaseId, null, "currentPhaseId=null");
        T.assertEqual(m2.pendingAction, null, "pendingAction=null");
        T.assert(!RT.start(m2, r.proto).ok, "再次 start 必须失败（不得重新运行已完成会议）");
      });
    });
  });

  /* ================= TEST-82~84 端到端 ================= */

  T.test("TEST-82", "E2E：SAVE → DESTROY → LOAD → CONTINUE → $end", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      return Archive.build(r.m, r.proto).then(function (archive) {
        r.m = null; /* DESTROY：丢弃内存会议 */
        var m2 = Restore.restore(archive); /* LOAD */
        return MRV.validate(archive, [r.proto]).then(function (rv) {
          T.assert(rv.ok, "Restore 语义校验通过");
          RT.submitHumanDecision(m2, r.proto, { choice: "finish" }); /* CONTINUE → $end */
          T.assertEqual(m2.status, "completed", "完成到 $end");
          T.assertEqual(m2.currentPhaseId, null, "$end 后 currentPhaseId=null");
          T.assert(m2.events.some(function (e) { return e.event_type === "meeting_completed"; }), "恢复后继续产生 meeting_completed");
        });
      });
    });
  });

  T.test("TEST-83", "E2E：Restore 后 Continue Cycle 正确", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      RT.submitHumanDecision(r.m, r.proto, { choice: "continue" });
      MOCK.runOnce(RT, r.m, r.proto); /* critique 完成 → human-decision */
      return Archive.build(r.m, r.proto).then(function (archive) {
        var m2 = Restore.restore(archive);
        RT.submitHumanDecision(m2, r.proto, { choice: "finish" });
        T.assertEqual(m2.status, "completed", "continue 后再 finish → completed");
      });
    });
  });

  T.test("TEST-84", "E2E：Restore 后 Battle 正确", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      r.m.stateData.battle_participants = ["agent-a1", "agent-b1"];
      RT.submitHumanDecision(r.m, r.proto, { choice: "battle" });
      MOCK.runOnce(RT, r.m, r.proto); /* battle 完成 → human-decision */
      return Archive.build(r.m, r.proto).then(function (archive) {
        var m2 = Restore.restore(archive);
        RT.submitHumanDecision(m2, r.proto, { choice: "battle" }); /* 恢复后再次 battle */
        MOCK.runOnce(RT, m2, r.proto);
        RT.submitHumanDecision(m2, r.proto, { choice: "finish" });
        T.assertEqual(m2.status, "completed", "battle 后再 finish → completed");
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
