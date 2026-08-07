/* AI Council v0.1 — D1-R1 测试夹具。
 * 所有夹具都从正式文件（protocol.schema.json / examples/*.json）派生，不维护第二套内容。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  /* 蓄意损坏的 JSON，对应开发指令第 9 节的例子 */
  var BROKEN_JSON = '{\n  "protocol_id":';

  function patch(text, mutate) {
    var o = JSON.parse(text);
    mutate(o);
    return JSON.stringify(o, null, 2);
  }

  function withId(text, id) {
    return patch(text, function (o) { o.protocol_id = id; });
  }

  function schemaEntry(schemaText) {
    return { path: "schemas/protocol.schema.json", text: schemaText };
  }

  function protocolEntry(dir, text) {
    return { path: "protocols/" + dir + "/protocol.json", text: text };
  }

  function liveProtocolEntry(dir, box) {
    return { path: "protocols/" + dir + "/protocol.json", read: function () { return box.text; } };
  }

  function buildSession(entries) {
    return A.FileSource.fromEntries(entries, "test-root").then(function (snapshot) {
      return A.ProtocolSession.initialize(snapshot);
    });
  }

  function codesOf(registry) {
    return registry.diagnostics.map(function (d) { return d.code; });
  }

  function idsOf(registry) {
    return registry.available.map(function (p) { return p.protocolId; }).sort();
  }

  A.TestFixtures = Object.freeze({
    BROKEN_JSON: BROKEN_JSON,
    patch: patch,
    withId: withId,
    schemaEntry: schemaEntry,
    protocolEntry: protocolEntry,
    liveProtocolEntry: liveProtocolEntry,
    buildSession: buildSession,
    codesOf: codesOf,
    idsOf: idsOf
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
