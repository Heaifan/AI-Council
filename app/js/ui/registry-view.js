/* AI Council v0.1 — D1-R1
 * 议事规则页渲染：本次会话概要 + 可用规则 + 已隔离规则。
 * 这是开发验证台，不是正式委员会 UI。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function sessionCard(session) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "本次会话"));
    box.appendChild(Dom.field("会话编号", session.sessionId));
    box.appendChild(Dom.field("建立时间", session.createdAt));
    box.appendChild(Dom.field("所选目录", session.rootName));
    box.appendChild(Dom.field("快照文件总数", session.snapshot.fileCount));
    box.appendChild(Dom.field("发现的规则文件", session.snapshot.protocolFiles.length));
    box.appendChild(Dom.field("Schema 文件", session.schema ? session.schema.filePath : "未确定"));
    box.appendChild(Dom.field("Schema 方言", session.schema ? session.schema.dialect : null));
    box.appendChild(Dom.el("p", "note", "本次会话已冻结：磁盘上的 protocol.json 之后如何修改，都不会影响这里的结果。"));
    return box;
  }

  function availableCard(registry) {
    var box = Dom.el("div", "card");
    var h = Dom.el("h2", null, "可用议事规则");
    h.appendChild(Dom.el("span", "count ok", registry.counts.available));
    box.appendChild(h);
    if (!registry.available.length) {
      box.appendChild(Dom.el("p", "empty", "当前目录没有解析成功的议事规则文件。"));
      box.appendChild(Dom.el("p", "note", "请确认所选目录下存在 protocols/*.json，且能通过 Schema 校验。"));
      return box;
    }
    registry.available.forEach(function (p) {
      var row = Dom.el("div", "entry ok");
      row.appendChild(Dom.el("div", "entry-title", p.protocolId + "  " + p.version));
      row.appendChild(Dom.field("名称", p.name));
      row.appendChild(Dom.field("文件", p.filePath));
      row.appendChild(Dom.field("阶段数", Array.isArray(p.document.phases) ? p.document.phases.length : "—"));
      box.appendChild(row);
    });
    return box;
  }

  function invalidEntry(entry) {
    var wrap = Dom.el("details", "entry bad");
    var summary = Dom.el("summary", null,
      (entry.protocolId || "(未知 protocol_id)") + "  " + (entry.version || "(未知 version)"));
    summary.appendChild(Dom.el("span", "code-tag", entry.diagnostics.length ? entry.diagnostics[0].code : "UNKNOWN"));
    wrap.appendChild(summary);
    wrap.appendChild(Dom.field("文件", entry.filePath));
    wrap.appendChild(Dom.field("诊断条数", entry.diagnostics.length));
    wrap.appendChild(A.DiagnosticView.renderList(entry.diagnostics));
    return wrap;
  }

  function invalidCard(registry) {
    var box = Dom.el("div", "card");
    var h = Dom.el("h2", null, "已隔离的议事规则");
    h.appendChild(Dom.el("span", "count " + (registry.counts.invalid ? "bad" : "ok"), registry.counts.invalid));
    box.appendChild(h);
    if (!registry.invalid.length) {
      box.appendChild(Dom.el("p", "empty", "没有被隔离的规则文件。"));
      return box;
    }
    registry.invalid.forEach(function (e) { box.appendChild(invalidEntry(e)); });
    return box;
  }

  function blockedCard(session) {
    var box = Dom.el("div", "card blocked");
    box.appendChild(Dom.el("h2", null, "本次会话未能初始化"));
    box.appendChild(A.DiagnosticView.renderList(session.diagnostics));
    return box;
  }

  function render(container, session) {
    Dom.clear(container);
    container.appendChild(sessionCard(session));
    if (!session.registry) { container.appendChild(blockedCard(session)); return; }
    if (session.diagnostics.length) container.appendChild(A.DiagnosticView.renderList(session.diagnostics));
    container.appendChild(availableCard(session.registry));
    container.appendChild(invalidCard(session.registry));
  }

  A.RegistryView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
