/* AI Council v0.1 — D1-R1
 * 从用户选择的项目目录采集测试所需的正式文件。夹具一律取自正式文件，不复制内容。
 */
(function (root) {
  "use strict";

  var REQUIRED = {
    schemaText: "schema/schemas/protocol.schema.json",
    validText: "schema/examples/valid-protocol-committee-mvp.json",
    invalidSchemaText: "schema/examples/invalid-protocol-schema.json",
    invalidSemanticText: "schema/examples/invalid-protocol-semantic.json"
  };

  var APP_SOURCE = /^app\/(?:js\/.*\.js|index\.html)$/;

  function relativePath(file) {
    var p = String(file.webkitRelativePath || file.name).replace(/\\/g, "/");
    var i = p.indexOf("/");
    return i < 0 ? p : p.slice(i + 1);
  }

  function fromFileList(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var wanted = [];
    files.forEach(function (f) {
      var rel = relativePath(f);
      var isRequired = Object.keys(REQUIRED).some(function (k) { return REQUIRED[k] === rel; });
      if (isRequired || APP_SOURCE.test(rel)) wanted.push({ rel: rel, file: f });
    });

    return Promise.all(wanted.map(function (w) {
      return w.file.text().then(function (t) { return { rel: w.rel, text: t }; });
    })).then(function (loaded) {
      var byPath = {};
      loaded.forEach(function (l) { byPath[l.rel] = l.text; });

      var ctx = { appSources: {}, missing: [] };
      Object.keys(REQUIRED).forEach(function (key) {
        var path = REQUIRED[key];
        if (typeof byPath[path] === "string") ctx[key] = byPath[path];
        else ctx.missing.push(path);
      });
      Object.keys(byPath).forEach(function (p) {
        if (APP_SOURCE.test(p)) ctx.appSources[p] = byPath[p];
      });
      return ctx;
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SourceBundle = Object.freeze({ REQUIRED: REQUIRED, fromFileList: fromFileList });
})(typeof globalThis !== "undefined" ? globalThis : this);
