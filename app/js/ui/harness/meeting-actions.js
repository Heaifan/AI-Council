/* AI Council v0.1 — D2-F1
 * MeetingActions：Meeting Tab 的按钮行为（点击 → 调用无 DOM 流程 → 回写 Store）。
 * 与 MeetingRuntimeView 分离：视图只管画，本文件只管做，二者都不含业务规则。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var msg = { text: "选择项目目录后，点 Create Demo Meeting 生成会议。", kind: "info" };

  function message() { return msg; }
  function say(text, kind) { msg = { text: text, kind: kind || "info" }; }
  function fail(e) { return e && e.message ? e.message : String(e); }

  function create() {
    var proto = A.HarnessStore.availableProtocol("committee-mvp");
    if (!proto) {
      say("Available 中找不到 committee-mvp，请选择包含 protocols/committee-mvp/ 的项目目录。", "warn");
      A.HarnessStore.notify();
      return;
    }
    var r = A.MeetingStepFlow.createDemo(proto);
    if (!r.ok) { say(r.message, "bad"); A.HarnessStore.notify(); return; }
    say("已创建 Demo Meeting，停在 " + r.meeting.currentPhaseId + "（未预跑任何步骤）。", "ok");
    A.HarnessStore.setMeeting(r.meeting, proto);
  }

  function step(state) {
    var r = A.MeetingStepFlow.step(state.meeting, state.protocol);
    say(r.ok ? ("已推进一步：" + r.participantId + " 完成 " + r.phaseId + "。") : r.message, r.ok ? "ok" : "warn");
    A.HarnessStore.setMeeting(state.meeting);
  }

  /* Human Gate 只能走这里：Mock 永远不得代替人类选择 finish / continue / battle。 */
  function decide(state, choice) {
    var r = A.MeetingStepFlow.decide(state.meeting, state.protocol, choice);
    say(r.ok ? ("人工决策 " + choice + " 已提交，当前 Phase：" + (state.meeting.currentPhaseId || "—") + "。" +
      (r.note ? " " + r.note : "")) : r.message, r.ok ? "ok" : "warn");
    A.HarnessStore.setMeeting(state.meeting);
  }

  function save(state) {
    A.ArchiveFlow.buildArchive(state.meeting, state.protocol, state.schemaPack).then(function (r) {
      if (!r.ok) { say(r.message, "bad"); A.HarnessStore.notify(); return; }
      try {
        A.MeetingPersistence.browserSave(r.archive, r.archive.meeting_id);
        say("已下载 " + A.MeetingPersistence.fileName(r.archive.meeting_id) + "：" + r.message, "ok");
      } catch (e) { say("写文件失败：" + fail(e), "bad"); }
      A.HarnessStore.notify();
    });
  }

  function load(state) {
    A.MeetingPersistence.browserLoad().then(function (text) {
      return A.ArchiveFlow.restoreFrom(text, state.schemaPack, (state.registry && state.registry.available) || []);
    }).then(function (r) {
      say(r.message, r.ok ? "ok" : "bad");
      if (r.ok) A.HarnessStore.setMeeting(r.meeting, r.protocol);
      else A.HarnessStore.notify();
    }).catch(function (e) {
      say("加载失败：" + fail(e), "bad");
      A.HarnessStore.notify();
    });
  }

  A.MeetingActions = Object.freeze({
    message: message, say: say,
    create: create, step: step, decide: decide, save: save, load: load
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
