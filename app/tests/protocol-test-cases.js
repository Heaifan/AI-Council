/* AI Council v0.1 — D1-R1 用例：Loader / Schema Validator / Registry 分流与重复检测。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;

  T.test("TEST-01", "一个合法 Protocol → Available=1 / Invalid=0", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("good-a", ctx.validText)])
      .then(function (s) {
        T.assert(s.registry, "Session 应已初始化");
        T.assertEqual(s.schema.filePath, "schemas/protocol.schema.json", "Schema 取自所选目录（方案 A）");
        T.assertEqual(s.registry.counts.available, 1, "Available");
        T.assertEqual(s.registry.counts.invalid, 0, "Invalid");
        T.assertEqual(s.registry.available[0].protocolId, "committee-mvp", "protocolId");
        T.assertEqual(s.registry.available[0].version, "0.1.0", "version");
      });
  });

  T.test("TEST-02", "两个合法 Protocol → Available=2 / Invalid=0", function (ctx) {
    return F.buildSession([
      F.schemaEntry(ctx.schemaText),
      F.protocolEntry("good-a", ctx.validText),
      F.protocolEntry("good-c", F.withId(ctx.validText, "demo-protocol"))
    ]).then(function (s) {
      T.assertEqual(s.registry.counts.available, 2, "Available");
      T.assertEqual(s.registry.counts.invalid, 0, "Invalid");
      T.assertEqual(F.idsOf(s.registry).join(","), "committee-mvp,demo-protocol", "Available 列表");
    });
  });

  T.test("TEST-03", "损坏 JSON → JSON_PARSE_FAILED，其余规则不受影响", function (ctx) {
    return F.buildSession([
      F.schemaEntry(ctx.schemaText),
      F.protocolEntry("good-a", ctx.validText),
      F.protocolEntry("broken-b", F.BROKEN_JSON)
    ]).then(function (s) {
      T.assertEqual(s.registry.counts.available, 1, "Available");
      T.assertEqual(s.registry.counts.invalid, 1, "Invalid");
      var bad = s.registry.invalid[0];
      T.assertEqual(bad.filePath, "protocols/broken-b/protocol.json", "隔离文件路径");
      T.assertEqual(bad.diagnostics[0].code, "JSON_PARSE_FAILED", "错误代码");
      T.assert(bad.diagnostics[0].message.length > 0, "必须给出解析错误信息，禁止静默");
    });
  });

  T.test("TEST-04", "invalid-protocol-schema.json → SCHEMA_VALIDATION_FAILED", function (ctx) {
    return F.buildSession([
      F.schemaEntry(ctx.schemaText),
      F.protocolEntry("missing-version", ctx.invalidSchemaText)
    ]).then(function (s) {
      T.assertEqual(s.registry.counts.available, 0, "Available");
      T.assertEqual(s.registry.counts.invalid, 1, "Invalid");
      var d = s.registry.invalid[0].diagnostics[0];
      T.assertEqual(d.code, "SCHEMA_VALIDATION_FAILED", "错误代码");
      T.assertEqual(d.jsonPath, "$", "JSON Path");
      T.assertEqual(d.details.keyword, "required", "Ajv keyword");
      T.assertEqual(d.details.params.missingProperty, "version", "缺失字段");
    });
  });

  T.test("TEST-05", "两个合法 + 一个坏规则 → Available=2 / Invalid=1", function (ctx) {
    return F.buildSession([
      F.schemaEntry(ctx.schemaText),
      F.protocolEntry("good-a", ctx.validText),
      F.protocolEntry("broken-b", F.BROKEN_JSON),
      F.protocolEntry("good-c", F.withId(ctx.validText, "demo-protocol"))
    ]).then(function (s) {
      T.assertEqual(s.registry.counts.available, 2, "Available");
      T.assertEqual(s.registry.counts.invalid, 1, "Invalid");
      T.assertEqual(F.idsOf(s.registry).join(","), "committee-mvp,demo-protocol", "坏规则不影响其余规则");
    });
  });

  T.test("TEST-06", "重复 protocol_id + version → DUPLICATE_PROTOCOL，且不覆盖", function (ctx) {
    var a = F.protocolEntry("dup-x", ctx.validText);
    var b = F.protocolEntry("dup-y", ctx.validText);
    return Promise.all([
      F.buildSession([F.schemaEntry(ctx.schemaText), a, b]),
      F.buildSession([F.schemaEntry(ctx.schemaText), b, a])
    ]).then(function (pair) {
      pair.forEach(function (s, i) {
        var label = i === 0 ? "顺序 A" : "顺序 B";
        T.assertEqual(s.registry.counts.available, 0, label + " Available（冲突双方都不得进入）");
        T.assertEqual(s.registry.counts.invalid, 2, label + " Invalid");
        s.registry.invalid.forEach(function (e) {
          T.assertEqual(e.diagnostics[0].code, "DUPLICATE_PROTOCOL", label + " 错误代码");
          T.assertEqual(e.diagnostics[0].details.conflictingFiles.length, 2, label + " 冲突文件数");
        });
      });
      T.assertEqual(
        JSON.stringify(pair[0].registry.invalid.map(function (e) { return e.filePath; })),
        JSON.stringify(pair[1].registry.invalid.map(function (e) { return e.filePath; })),
        "结果不得依赖浏览器返回的文件顺序"
      );
    });
  });

  T.test("TEST-07", "Schema 多错误必须全部保存", function (ctx) {
    var multi = F.patch(ctx.validText, function (o) {
      o.protocol_id = "Bad_ID!";
      o.source = "unknown";
      o.lifecycle_status = "draft";
      delete o.initial_phase_id;
    });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("multi-error", multi)])
      .then(function (s) {
        var ds = s.registry.invalid[0].diagnostics;
        T.assert(ds.length >= 4, "至少 4 条诊断，实际 " + ds.length);
        ds.forEach(function (d) { T.assertEqual(d.code, "SCHEMA_VALIDATION_FAILED", "错误代码"); });
        var paths = ds.map(function (d) { return d.jsonPath; });
        ["$.protocol_id", "$.source", "$.lifecycle_status", "$"].forEach(function (p) {
          T.assert(paths.indexOf(p) >= 0, "缺少 JSON Path " + p + "，实际 " + paths.join(" "));
        });
        T.assertEqual(s.registry.counts.diagnostics, ds.length, "Registry 汇总必须包含全部诊断");
      });
  });

  T.test("TEST-11", "语义非法示例在 D1-R1 通过 Schema 层（未偷跑 D1-R2）", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("semantic", ctx.invalidSemanticText)])
      .then(function (s) {
        T.assertEqual(s.registry.counts.available, 1, "Available（语义检查属于 D1-R2）");
        T.assertEqual(s.registry.counts.invalid, 0, "Invalid");
      });
  });

  T.test("TEST-12", "不支持的 schema_version → UNSUPPORTED_SCHEMA_VERSION", function (ctx) {
    var future = F.patch(ctx.validText, function (o) { o.schema_version = "0.2.0"; });
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("future", future)])
      .then(function (s) {
        T.assertEqual(s.registry.counts.available, 0, "Available");
        T.assertEqual(s.registry.invalid[0].diagnostics[0].code, "UNSUPPORTED_SCHEMA_VERSION", "错误代码");
      });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
