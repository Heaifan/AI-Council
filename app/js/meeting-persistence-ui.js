/* AI Council v0.1 — D1-R4
 * MeetingPersistenceUI：最小浏览器面板（计划 §76）。不做正式 Persistence UI（§77）。
 *
 * 仅浏览器环境：把“当前活动会议”保存为 *.meeting.json，或从文件恢复。
 * 活动会议来自 window.AICouncilHarness（由 app.js 在选择目录后暴露 snapshot + registry）。
 * 本文件不参与自动测试（run-node.js 不加载它），所有异常都被捕获并显示在状态区，不会破坏页面。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function $(id) { return document.getElementById(id); }

  function buildSchemaPack(snapshot) {
    if (!snapshot || !snapshot.schemaMatches) return null;
    var byPath = {};
    snapshot.schemaMatches.forEach(function (r) { byPath[r.path] = r.text; });
    var paths = {
      meeting: "schema/schemas/meeting.schema.json",
      role: "schema/schemas/role.schema.json",
      message: "schema/schemas/message.schema.json",
      artifact: "schema/schemas/artifact.schema.json",
      annotation: "schema/schemas/annotation.schema.json"
    };
    var pack = {};
    for (var k in paths) {
      var t = byPath[paths[k]];
      if (typeof t !== "string") return null;
      try { pack[k] = JSON.parse(t); } catch (e) { return null; }
    }
    return pack;
  }

  function setMsg(text, kind) {
    var n = $("ps-msg");
    if (n) { n.textContent = text; n.className = "status " + (kind || "info"); }
  }

  function render(meeting) {
    if (!meeting) return;
    if ($("ps-status")) $("ps-status").textContent = meeting.status;
    if ($("ps-phase")) $("ps-phase").textContent = meeting.currentPhaseId || "—";
    if ($("ps-events")) $("ps-events").textContent = (meeting.events || []).length;
    if ($("ps-cp")) $("ps-cp").textContent = (meeting.checkpoints || []).length;
  }

  function demoParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary" }
    ];
  }

  function createDemo() {
    try {
      var h = root.AICouncilHarness;
      if (!h || !h.registry) { setMsg("请先选择包含 committee-mvp 的项目目录。", "warn"); return; }
      var proto = (h.registry.available || []).filter(function (p) { return p.protocolId === "committee-mvp"; })[0];
      if (!proto) { setMsg("Available 中找不到 committee-mvp。", "warn"); return; }
      var m = A.MeetingFactory.createMeeting(proto, { meetingId: "demo-" + Date.now().toString(36), participants: demoParticipants() });
      A.MeetingRuntime.start(m, proto);
      A.MockAgentRuntime.runOnce(A.MeetingRuntime, m, proto);
      A.MockAgentRuntime.runOnce(A.MeetingRuntime, m, proto);
      A.MockAgentRuntime.runOnce(A.MeetingRuntime, m, proto);
      h.currentMeeting = m; h.currentProtocol = proto;
      render(m);
      setMsg("已创建并运行到 human-decision（waiting_human）。", "ok");
    } catch (e) { setMsg("Create Demo 失败：" + (e && e.message ? e.message : String(e)), "bad"); }
  }

  function save() {
    try {
      var h = root.AICouncilHarness;
      if (!h || !h.currentMeeting) { setMsg("没有活动会议，请先 Create Demo Meeting。", "warn"); return; }
      var pack = buildSchemaPack(h.snapshot);
      if (!pack) { setMsg("Schema Pack 不完整（PERSISTENCE_SCHEMA_PACK_INCOMPLETE）。", "bad"); return; }
      A.MeetingArchive.build(h.currentMeeting, h.currentProtocol).then(function (archive) {
        var sv = A.MeetingSchemaValidator.create(pack);
        if (!sv.ok) { setMsg("Schema Pack 编译失败：" + sv.diagnostic.message, "bad"); return; }
        var res = sv.validate(archive);
        if (!res.ok) { setMsg("存档 Schema 校验失败（PERSISTENCE_ARCHIVE_SCHEMA_INVALID）：" + res.diagnostics[0].message, "bad"); return; }
        A.MeetingPersistence.browserSave(archive, archive.meeting_id);
        render(h.currentMeeting);
        setMsg("已保存 " + A.MeetingPersistence.fileName(archive.meeting_id) +
          "（Events " + archive.events.length + ", Checkpoints " + archive.checkpoints.length + "）。", "ok");
      }).catch(function (e) { setMsg("保存失败：" + (e && e.message ? e.message : String(e)), "bad"); });
    } catch (e) { setMsg("保存失败：" + (e && e.message ? e.message : String(e)), "bad"); }
  }

  function load() {
    try {
      var h = root.AICouncilHarness;
      if (!h || !h.registry) { setMsg("请先选择项目目录。", "warn"); return; }
      A.MeetingPersistence.browserLoad().then(function (text) {
        var p = A.MeetingPersistence.parse(text);
        if (!p.ok) { setMsg("JSON 解析失败：" + p.diagnostic.message, "bad"); return; }
        var pack = buildSchemaPack(h.snapshot);
        if (!pack) { setMsg("Schema Pack 不完整。", "bad"); return; }
        var sv = A.MeetingSchemaValidator.create(pack);
        if (!sv.ok) { setMsg("Schema Pack 编译失败。", "bad"); return; }
        var sr = sv.validate(p.value);
        if (!sr.ok) { setMsg("Schema 校验失败：" + sr.diagnostics[0].message, "bad"); return; }
        return A.MeetingRestoreValidator.validate(p.value, h.registry.available).then(function (rv) {
          if (!rv.ok) { setMsg("Restore 语义校验失败：" + rv.diagnostics[0].message, "bad"); return; }
          var m = A.MeetingRestore.restore(p.value);
          h.currentMeeting = m;
          h.currentProtocol = (h.registry.available || []).filter(function (x) {
            return x.protocolId === p.value.protocol_snapshot.protocol_id && x.version === p.value.protocol_snapshot.version;
          })[0];
          render(m);
          setMsg("已恢复会议：" + m.status + " / " + (m.currentPhaseId || "—") + "（原子提交，原会议未动）。", "ok");
        });
      }).catch(function (e) { setMsg("加载失败：" + (e && e.message ? e.message : String(e)), "bad"); });
    } catch (e) { setMsg("加载失败：" + (e && e.message ? e.message : String(e)), "bad"); }
  }

  function start() {
    var d = $("ps-demo"), s = $("ps-save"), l = $("ps-load");
    if (d) d.addEventListener("click", createDemo);
    if (s) s.addEventListener("click", save);
    if (l) l.addEventListener("click", load);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
