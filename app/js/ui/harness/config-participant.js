/* AI Council v0.1 — D3 · 会议控制台 · ConfigParticipant：左栏「与会者配置」卡片渲染。
 * 每位委员一张卡：角色 / 模型名称 / 模型引用 / 传输方式 / 模型网页 + 打开模型网页。
 * 只读投影 + 事件转发到 ConsoleActions；不持有任何状态。
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

  function render(pt, profile, frozen, actions) {
    var box = Dom.el("div", "card cfg-participant");
    var pid = pt.participant_id;
    box.appendChild(Dom.el("h3", null, (pt.alias || pid) + " · 配置"));

    var role = selectFor([["advisor", "顾问委员"], ["chair_secretary", "主席兼秘书"]]);
    role.value = pt.role_class || "advisor";
    fieldRow(box, "cfg-role-" + pid, "角色", role);
    role.disabled = frozen;
    role.addEventListener("change", function () { actions.setParticipantField(pid, "role_class", role.value); });

    var name = textInput(profile ? profile.display_name : "", "模型名称（如 ChatGPT）");
    fieldRow(box, "cfg-model-name-" + pid, "模型名称", name);
    name.disabled = frozen || !profile;
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

    var openBtn = Dom.el("button", "btn secondary", "打开模型网页");
    openBtn.id = "cfg-open-web-" + pid;
    openBtn.disabled = !profile || !A.RelayProfiles.isSafeUrl(profile.web_url);
    openBtn.addEventListener("click", function () { actions.openWeb(pt.model_ref); });
    box.appendChild(openBtn);
    return box;
  }

  A.ConfigParticipant = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
