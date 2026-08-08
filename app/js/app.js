/* AI Council v0.1 — 开发验证台入口（建于 D2-F1，D3 沿用）
 * 唯一职责：把用户的一次目录选择接到 ProtocolSession，渲染「议事规则」Tab，并把 Session 交给 HarnessStore。
 * 本文件不含任何定时器、轮询、watcher 或网络请求，也不参与会议推进 / 编译（那是 harness/* 的事）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var state = { snapshot: null, schemaOverride: null };
  var dirInput, schemaInput, statusBar, output, current;

  function status(text, kind) {
    statusBar.textContent = text;
    statusBar.className = "status " + (kind || "info");
  }

  function rebuild() {
    if (!state.snapshot) return;
    var session;
    try {
      session = A.ProtocolSession.initialize(state.snapshot, state.schemaOverride);
    } catch (e) {
      status("初始化失败：" + (e && e.message ? e.message : String(e)), "bad");
      return;
    }
    A.RegistryView.render(output, session);
    if (current) current.textContent = session.rootName + "/";
    /* D2-F1：Session 与其随行资产（Schema Pack / Role Card 库）一次性交给 HarnessStore，
     * Meeting 与 Compiler 两个 Tab 只从 Store 取状态，绝不各自再去碰 snapshot。 */
    A.HarnessStore.setSession(state.snapshot, session);
    if (A.ConsoleActions) A.ConsoleActions.resetSessionState();
    if (A.ProjectBar) A.ProjectBar.writeLast(session.rootName || "");
    if (!session.registry) {
      status("本次会话未能初始化：缺少可用的正式 Schema 文件。", "warn");
      return;
    }
    var c = session.registry.counts;
    status("会话 " + session.sessionId + " 已冻结 · 可用规则 " + c.available +
      " · 已隔离 " + c.invalid + " · 诊断 " + c.diagnostics,
      c.invalid ? "warn" : "ok");
  }

  function onDirectoryChosen(event) {
    var files = event.target.files;
    if (!files || !files.length) return;
    status("正在建立目录只读快照…（本次读取后不再访问磁盘）", "info");
    A.FileSource.fromFileList(files).then(function (snapshot) {
      state.snapshot = snapshot;
      // F01: 重新选择目录必须结束旧 Schema Override，让新目录自行发现自身 Schema。
      // 旧 Override 属于上一个目录选择 Session，不得带入新 Session（否则跨目录残留）。
      state.schemaOverride = null;
      rebuild();
    }).catch(function (e) {
      status("读取目录失败：" + (e && e.message ? e.message : String(e)), "bad");
    }).then(function () { dirInput.value = ""; });
  }

  function onSchemaChosen(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    file.text().then(function (text) {
      state.schemaOverride = { path: file.name, text: text };
      status("已指定正式 Schema：" + file.name, "info");
      rebuild();
    }).catch(function (e) {
      status("读取 Schema 失败：" + (e && e.message ? e.message : String(e)), "bad");
    }).then(function () { schemaInput.value = ""; });
  }

  function start() {
    dirInput = document.getElementById("dir-input");
    schemaInput = document.getElementById("schema-input");
    statusBar = document.getElementById("status");
    output = document.getElementById("output");
    current = document.getElementById("dir-current");

    if (!root.AjvBundle) {
      status("vendor/ajv2020.bundle.js 未加载，无法执行正式 Schema 校验。", "bad");
      return;
    }
    dirInput.addEventListener("change", onDirectoryChosen);
    schemaInput.addEventListener("change", onSchemaChosen);
    status("等待用户选择项目目录。", "info");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(typeof globalThis !== "undefined" ? globalThis : this);
