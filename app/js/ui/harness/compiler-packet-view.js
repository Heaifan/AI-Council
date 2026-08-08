/* AI Council v0.1 — D2-F1
 * CompilerPacketView：渲染一次编译的产物——InstructionPacket 摘要 / Raw JSON / Rendered Prompt。
 * 只消费 CompileFlow.run 的返回值，绝不自己去翻 packet 结构做二次解释。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  var DIGEST_ROWS = [
    ["cp-packet-id", "packet_id", "packet_id"],
    ["cp-protocol", "Protocol", "protocol"],
    ["cp-meeting", "Meeting", "meeting_id"],
    ["cp-phase", "Phase", "phase"],
    ["cp-participant", "Participant", "participant"],
    ["cp-role", "Role Card", "role"],
    ["cp-visibility", "Visibility", "visibility"],
    ["cp-task", "Task", "task"]
  ];

  function row(box, id, label, value) {
    var f = Dom.field(label, value);
    f.lastChild.id = id;
    box.appendChild(f);
  }

  function errorCard(res) {
    var box = Dom.el("div", "card blocked");
    box.appendChild(Dom.el("h2", null, "编译失败"));
    row(box, "cp-error-stage", "阶段", res.stage);
    row(box, "cp-error-msg", "诊断", res.message);
    if (res.diagnostics && res.diagnostics.length) {
      box.appendChild(A.DiagnosticView.renderList(res.diagnostics));
    }
    return box;
  }

  function digestCard(res, rawOpen, onToggleRaw) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "InstructionPacket 摘要"));
    DIGEST_ROWS.forEach(function (r) { row(box, r[0], r[1], res.digest[r[2]]); });
    var chk = res.schemaCheck;
    var kind = chk.checked ? (chk.ok ? "ok" : "bad") : "warn";
    var line = Dom.el("div", "status " + kind, chk.message);
    line.id = "cp-schema-check";
    box.appendChild(line);
    var t = Dom.el("button", "btn secondary", rawOpen ? "隐藏 Raw JSON" : "查看 Raw JSON");
    t.id = "cp-raw-toggle";
    t.addEventListener("click", onToggleRaw);
    box.appendChild(t);
    if (rawOpen) {
      var pre = Dom.el("pre", "raw", res.raw);
      pre.id = "cp-raw";
      box.appendChild(pre);
    }
    return box;
  }

  /* Rendered Prompt 用只读 textarea：Ctrl+A / Ctrl+C 即可复制。
   * 刻意不使用 Clipboard API——它会触发权限申请，破坏 local-first 与 file:// 下的确定性。 */
  function promptCard(res) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "Rendered Prompt"));
    var ta = document.createElement("textarea");
    ta.id = "cp-prompt";
    ta.className = "prompt-box";
    ta.readOnly = true;
    ta.rows = 26;
    ta.spellcheck = false;
    ta.value = res.prompt;
    box.appendChild(ta);
    box.appendChild(Dom.el("p", "note",
      "复制方式：点进文本框 → Ctrl+A → Ctrl+C。本应用不调用 Clipboard API，保持纯本地、零权限申请。"));
    return box;
  }

  A.CompilerPacketView = Object.freeze({
    errorCard: errorCard, digestCard: digestCard, promptCard: promptCard
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
