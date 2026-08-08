/* AI Council v0.1 — D3 · 六席会议控制台 · SeatConfigFields：席位配置表单字段构建（DOM 投影）。
 * 角色 / 模型名称 / 模型引用 / 传输方式 / 网页 URL / 立场 / 备注 + 打开网页/返回按钮。
 * 冻结规则：role/model_ref/transport_kind 创建后冻结；web_url/显示名/立场/备注仍可改。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function fieldRow(box, id, label, control) {
    var f = Dom.el("div", "cfg-field");
    f.appendChild(Dom.el("label", "cfg-label", label));
    control.id = id;
    f.appendChild(control);
    box.appendChild(f);
  }

  function selectFor(opts) {
    var sel = document.createElement("select");
    opts.forEach(function (o) {
      var el = document.createElement("option");
      el.value = o[0]; el.textContent = o[1];
      sel.appendChild(el);
    });
    return sel;
  }

  function textInput(value, ph) {
    var i = document.createElement("input");
    i.type = "text"; i.value = value || ""; i.placeholder = ph || "";
    return i;
  }

  /* 构建全部字段到 box；actions 为 ConsoleActions。返回 box（已含按钮行）。 */
  function build(box, pt, seat, profile, frozen, actions) {
    var pid = pt.participant_id;

    var role = selectFor([["advisor", "顾问委员"], ["chair_secretary", "主席兼秘书"]]);
    role.value = pt.role_class || "advisor";
    fieldRow(box, "cfg-role-" + pid, "角色", role);
    role.disabled = frozen;
    role.addEventListener("change", function () { actions.setParticipantField(pid, "role_class", role.value); });

    var name = textInput(profile ? profile.display_name : "", "模型名称（如 ChatGPT）");
    fieldRow(box, "cfg-model-name-" + pid, "模型名称", name);
    name.disabled = !profile;
    name.addEventListener("change", function () {
      if (profile) actions.updateProfile({ profile_id: profile.profile_id, display_name: name.value, model_ref: profile.model_ref, web_url: profile.web_url });
    });

    var ref = textInput(pt.model_ref || "", "model_ref（如 chatgpt-web）");
    fieldRow(box, "cfg-model-ref-" + pid, "模型引用", ref);
    ref.disabled = frozen;
    ref.addEventListener("change", function () { actions.setParticipantField(pid, "model_ref", ref.value); });

    var t = selectFor([["mock", "模拟 Agent"], ["web_relay", "网页中继"]]);
    t.value = pt.transport_kind || "mock";
    fieldRow(box, "cfg-transport-" + pid, "传输方式", t);
    t.disabled = frozen;
    t.addEventListener("change", function () { actions.setParticipantField(pid, "transport_kind", t.value); });

    var url = textInput(profile ? profile.web_url : "", "@url 例如 https://chatgpt.com/");
    fieldRow(box, "cfg-url-" + pid, "模型网页", url);
    url.disabled = !profile;
    url.addEventListener("change", function () {
      if (profile) actions.updateProfile({ profile_id: profile.profile_id, display_name: profile.display_name, model_ref: profile.model_ref, web_url: url.value });
    });

    var stance = selectFor([["support", "支持"], ["oppose", "反对"], ["neutral", "中立"]]);
    stance.value = seat.stance || "neutral";
    fieldRow(box, "cfg-stance-" + pid, "立场", stance);
    stance.addEventListener("change", function () { actions.setStance(pid, stance.value); });

    var note = textInput(actions.getNotes()[pid] || "", "席位备注（可选）");
    fieldRow(box, "cfg-note-" + pid, "备注", note);
    note.addEventListener("change", function () { actions.setNote(pid, note.value); });

    var bar = Dom.el("div", "controls");
    var openBtn = Dom.el("button", "btn secondary", "打开模型网页");
    openBtn.id = "cfg-open-web-" + pid;
    openBtn.disabled = !profile || !A.RelayProfiles.isSafeUrl(profile.web_url);
    openBtn.addEventListener("click", function () { actions.openWeb(pt.model_ref); });
    bar.appendChild(openBtn);
    var back = Dom.el("button", "btn secondary", "返回会议运行");
    back.id = "seat-config-back";
    back.addEventListener("click", function () { actions.setMode("run"); });
    bar.appendChild(back);
    box.appendChild(bar);
    return box;
  }

  A.SeatConfigFields = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
