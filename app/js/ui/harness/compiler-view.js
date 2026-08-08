/* AI Council v0.1 — D2-F1
 * CompilerView：Compiler Tab。
 *
 * 唯一可选对象是 meeting.participants[]——「这场会议里的人」。
 * 绝不把 roles/*.json 列成可选 Agent：Role Card 只是岗位说明书，Participant 才是与会者。
 * 没有 Meeting 时整个 Tab 禁用，并明确要求先去 Meeting 页建会。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  var view = { participantId: null, rawOpen: false };

  function toggleRaw() { view.rawOpen = !view.rawOpen; A.HarnessStore.notify(); }

  function disabledCard(reason) {
    var box = Dom.el("div", "card blocked");
    box.appendChild(Dom.el("h2", null, "指令编译器"));
    var p = Dom.el("p", "empty", reason);
    p.id = "cp-disabled";
    box.appendChild(p);
    return box;
  }

  function option(o) {
    var op = document.createElement("option");
    op.value = o.participant_id;
    op.textContent = o.label + (o.targeted ? "　← 本阶段目标" : "");
    op.setAttribute("data-role-id", o.role_id || "");
    op.setAttribute("data-role-class", o.role_class);
    op.setAttribute("data-resolved-by", o.resolved_by);
    return op;
  }

  function selector(opts) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "与会者（来自当前会议的 participants[]）"));
    var sel = document.createElement("select");
    sel.id = "cp-participant-select";
    sel.className = "select";
    opts.forEach(function (o) { sel.appendChild(option(o)); });
    sel.value = view.participantId;
    sel.addEventListener("change", function (e) {
      view.participantId = e.target.value;
      view.rawOpen = false;
      A.HarnessStore.notify();
    });
    box.appendChild(sel);
    var cur = opts.filter(function (o) { return o.participant_id === view.participantId; })[0];
    if (cur) {
      var f = Dom.field("角色解析", (cur.declared_role_id || "（未声明 role_id）") + " → " +
        (cur.role_id || "（未命中）") + "（按 " + cur.resolved_by + "）");
      f.lastChild.id = "cp-role-resolution";
      box.appendChild(f);
    }
    box.appendChild(Dom.el("p", "note",
      "角色卡 ≠ 与会者 ≠ 模型：这里列的是本场会议的与会者，不是 roles/ 目录里的岗位说明书。"));
    return box;
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var gate = A.ParticipantBinding.compilerState(state.meeting);
    if (!gate.enabled) { view.participantId = null; host.appendChild(disabledCard(gate.reason)); return; }

    var opts = A.ParticipantBinding.options(state.meeting, state.roleRegistry, state.protocol);
    var ids = opts.map(function (o) { return o.participant_id; });
    if (ids.indexOf(view.participantId) < 0) {
      view.participantId = A.ParticipantBinding.defaultParticipantId(opts);
      view.rawOpen = false;
    }
    host.appendChild(selector(opts));

    var res = A.CompileFlow.run({
      protocol: state.protocol, meeting: state.meeting,
      participantId: view.participantId,
      roleRegistry: state.roleRegistry, packetSchema: state.packetSchema
    });
    var P = A.CompilerPacketView;
    if (!res.ok) { host.appendChild(P.errorCard(res)); return; }
    host.appendChild(P.digestCard(res, view.rawOpen, toggleRaw));
    host.appendChild(P.promptCard(res));
  }

  A.CompilerView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
