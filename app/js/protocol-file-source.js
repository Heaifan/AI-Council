/* AI Council v0.1 — D1-R1
 * ProtocolFileSource：把一次用户目录选择固化成不可变 File Snapshot。
 * 唯一职责：路径发现 + 一次性读取文本。快照建立后不再持有 File 句柄，天然无热加载。
 */
(function (root) {
  "use strict";

  var PROTOCOL_PATH = /^protocols\/(?:.+\/)?protocol\.json$/;
  var SCHEMA_PATH = /(?:^|\/)schemas\/protocol\.schema\.json$/;
  /* D2-F1：Harness 接线所需的其它正式资产（Schema Pack + Role Card 库）。
   * 与 Protocol 发现完全分开：这些文件不参与 Protocol Registry 分流，只供 Persistence / Compiler 使用。 */
  var ASSET_PATH = /^(?:schema\/schemas\/[a-z0-9-]+\.schema\.json|roles\/[^/]+\.json)$/;

  function normalize(p) {
    return String(p).replace(/\\/g, "/").replace(/^\.\//, "");
  }

  /* webkitRelativePath 的首段是用户选中的目录名，需剥离后才是项目内相对路径 */
  function stripRootSegment(path) {
    var i = path.indexOf("/");
    return i < 0 ? path : path.slice(i + 1);
  }

  function readRecords(records) {
    var jobs = records.map(function (r) {
      return Promise.resolve()
        .then(function () { return r.read(); })
        .then(function (text) { return { path: r.path, text: text, readError: null }; })
        .catch(function (e) { return { path: r.path, text: null, readError: String(e && e.message || e) }; });
    });
    return Promise.all(jobs);
  }

  function build(rootName, records) {
    var protocolRecords = records.filter(function (r) { return PROTOCOL_PATH.test(r.path); });
    var schemaRecords = records.filter(function (r) { return SCHEMA_PATH.test(r.path); });
    var assetRecords = records.filter(function (r) { return ASSET_PATH.test(r.path); });
    return Promise.all([readRecords(protocolRecords), readRecords(schemaRecords), readRecords(assetRecords)])
      .then(function (res) {
        return Object.freeze({
          rootName: rootName,
          createdAt: new Date().toISOString(),
          fileCount: records.length,
          index: Object.freeze(records.map(function (r) { return r.path; })),
          protocolFiles: Object.freeze(res[0].map(Object.freeze)),
          schemaMatches: Object.freeze(res[1].map(Object.freeze)),
          assetFiles: Object.freeze(res[2].map(Object.freeze))
        });
      });
  }

  /* 浏览器：<input type="file" webkitdirectory multiple> 的 FileList */
  function fromFileList(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve(build("(empty)", []));
    var rootName = normalize(files[0].webkitRelativePath || files[0].name).split("/")[0];
    var records = files.map(function (f) {
      var rel = f.webkitRelativePath ? stripRootSegment(normalize(f.webkitRelativePath)) : normalize(f.name);
      return { path: rel, read: function () { return f.text(); } };
    });
    return build(rootName, records);
  }

  /* 测试 / Node：已经是项目内相对路径的条目 [{path, text}] 或 [{path, read}] */
  function fromEntries(entries, rootName) {
    var records = (entries || []).map(function (e) {
      var text = e.text;
      return {
        path: normalize(e.path),
        read: e.read || function () {
          if (typeof text !== "string") throw new Error("no text supplied");
          return text;
        }
      };
    });
    return build(rootName || "(entries)", records);
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.FileSource = Object.freeze({
    PROTOCOL_PATH: PROTOCOL_PATH,
    SCHEMA_PATH: SCHEMA_PATH,
    ASSET_PATH: ASSET_PATH,
    fromFileList: fromFileList,
    fromEntries: fromEntries
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
