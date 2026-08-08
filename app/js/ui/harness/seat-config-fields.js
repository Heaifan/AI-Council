/* AI Council v0.1 — D3 · 六席会议控制台 · SeatConfigFields：席位配置表单字段构建（DOM 投影）。
 * F1：双栏 grid；挂起式编辑 + [取消]/[保存配置]；冻结字段级化（role_class 锁，model_ref/transport 可改）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function fieldRow(box, id, label, control, span2) {
    var f = Dom.el("div", "cfg-field" + (span2 ? " span2" : ""));
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

  /* 构建全部字段到 box；commit(edits) 保存回调，cancel() 取消回调。 */
  function build(box, pt, seat, profile, frozen, actions, commit, cancel) {
    var pid = pt.participant_id;
    var edits = {
      role_class: pt.role_class || "advisor", model_ref: pt.model_ref || "",
      transport_kind: pt.transport_kind || "mock", display_name: profile ? profile.display_name : "",
      web_url: profile ? profile.web_url : "", stance: seat.stance || "neutral",
      note: actions.getNotes()[pid] || "", origModelRef: pt.model_ref || ""
    };
    var grid = Dom.el("div", "cfg-grid");

    var role = selectFor([["advisor", "顾问委员"], ["chair_secretary", "主席兼秘书"]]);
    role.value = edits.role_class;
    fieldRow(grid, "cfg-role-" + pid, "角色", role);
    role.disabled = frozen;   /* 角色身份创建后冻结 */
    role.addEventListener("change", function () { edits.role_class = role.value; });

    var name = textInput(edits.display_name, "模型名称（如 ChatGPT）");
    fieldRow(grid, "cfg-model-name-" + pid, "模型名称", name);
    name.disabled = !profile;
    name.addEventListener("change", function () { edits.display_name = name.value; });

    var ref = textInput(edits.model_ref, "model_ref（如 chatgpt-web）");
    fieldRow(grid, "cfg-model-ref-" + pid, "模型引用", ref);
    ref.addEventListener("change", function () { edits.model_ref = ref.value.trim(); });

    var url = textInput(edits.web_url, "@url 例如 https://chatgpt.com/");
    fieldRow(grid, "cfg-url-" + pid, "模型网页", url);
    url.disabled = !profile;
    url.addEventListener("change", function () {
      edits.web_url = url.value;
      if (openBtn) openBtn.disabled = !profile || !A.RelayProfiles.isSafeUrl(url.value);   /* C06 即时反馈 */
    });

    var t = selectFor([["mock", "模拟 Agent"], ["web_relay", "网页中继"]]);
    t.value = edits.transport_kind;
    fieldRow(grid, "cfg-transport-" + pid, "传输方式", t);
    t.addEventListener("change", function () { edits.transport_kind = t.value; });

    var stance = selectFor([["support", "支持"], ["oppose", "反对"], ["neutral", "中立"]]);
    stance.value = edits.stance;
    fieldRow(grid, "cfg-stance-" + pid, "立场", stance);
    stance.addEventListener("change", function () { edits.stance = stance.value; });

    var note = textInput(edits.note, "席位备注（可选）");
    fieldRow(grid, "cfg-note-" + pid, "备注", note, true);
    note.addEventListener("change", function () { edits.note = note.value; });

    var bar = Dom.el("div", "controls span2");
    var cancelBtn = Dom.el("button", "btn secondary", "取消");
    cancelBtn.id = "seat-config-cancel"; cancelBtn.addEventListener("click", cancel);
    bar.appendChild(cancelBtn);
    var save = Dom.el("button", "btn primary", "保存配置");
    save.id = "seat-config-save"; save.addEventListener("click", function () { commit(edits); });
    bar.appendChild(save);
    var openBtn = Dom.el("button", "btn secondary", "打开模型网页");
    openBtn.id = "cfg-open-web-" + pid;
    openBtn.disabled = !profile || !A.RelayProfiles.isSafeUrl(edits.web_url);
    openBtn.addEventListener("click", function () { actions.openWeb(edits.origModelRef); });
    bar.appendChild(openBtn);
    grid.appendChild(bar);
    box.appendChild(grid);
    return box;
  }

  A.SeatConfigFields = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
