/* AI Council v0.1 — D1-R1
 * ProtocolRegistry：把加载结果分流为 available / invalid（Quarantine）。
 * 唯一职责：分流 + 重复检测 + 冻结。坏规则不得进入 available，也不得静默消失。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil && root.AICouncil.Diagnostic;
  var SV = root.AICouncil && root.AICouncil.SchemaValidator;

  function deepFreeze(o) {
    if (!o || typeof o !== "object" || Object.isFrozen(o)) return o;
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    return o;
  }

  function quarantine(filePath, identity, diagnostics) {
    return Object.freeze({
      filePath: filePath,
      protocolId: identity ? identity.protocolId : null,
      version: identity ? identity.version : null,
      name: identity ? identity.name : null,
      diagnostics: Object.freeze(diagnostics.slice())
    });
  }

  /* 阶段一：解析结果 → 候选 / 隔离（Schema PASS 后追加 D1-R2 Semantic Gate） */
  function classify(loadResults, validator, semanticValidator) {
    var candidates = [], invalid = [];
    (loadResults || []).forEach(function (r) {
      if (!r.ok) { invalid.push(quarantine(r.filePath, r.identity, r.diagnostics)); return; }

      var versionIssue = SV.checkSchemaVersion(r.identity, r.filePath);
      if (versionIssue) { invalid.push(quarantine(r.filePath, r.identity, [versionIssue])); return; }

      var result = validator.validate(r.parsed);
      if (!result.valid) {
        invalid.push(quarantine(r.filePath, r.identity, SV.toDiagnostics(result.errors, r.filePath, r.identity)));
        return;
      }

      /* D1-R2：Schema PASS 不等于 Available，再做确定性语义校验 */
      if (semanticValidator) {
        var sr = semanticValidator.validate(r.parsed);
        if (!sr.valid) {
          var semDiags = sr.diagnostics.map(function (rawD) {
            return D.create({
              code: rawD.code,
              filePath: r.filePath,
              protocolId: r.identity.protocolId,
              protocolVersion: r.identity.version,
              jsonPath: rawD.jsonPath,
              message: rawD.message,
              details: rawD.details
            });
          });
          invalid.push(quarantine(r.filePath, r.identity, semDiags));
          return;
        }
      }

      candidates.push({ filePath: r.filePath, identity: r.identity, document: r.parsed });
    });
    return { candidates: candidates, invalid: invalid };
  }

  /* 阶段二：protocol_id + version 唯一性。冲突双方都不进 available，禁止后者覆盖前者 */
  function splitDuplicates(candidates) {
    var groups = Object.create(null);
    candidates.forEach(function (c) {
      var key = c.identity.protocolId + "@" + c.identity.version;
      (groups[key] = groups[key] || []).push(c);
    });

    var accepted = [], conflicted = [];
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (group.length === 1) { accepted.push(group[0]); return; }
      var paths = group.map(function (g) { return g.filePath; }).sort();
      group.forEach(function (c) {
        conflicted.push(quarantine(c.filePath, c.identity, [D.create({
          code: D.CODE.DUPLICATE_PROTOCOL,
          filePath: c.filePath,
          protocolId: c.identity.protocolId,
          protocolVersion: c.identity.version,
          jsonPath: "$.protocol_id",
          message: "protocol_id + version 冲突：" + key + " 出现在 " + group.length + " 个文件中，全部拒绝进入 Available。",
          details: { key: key, conflictingFiles: paths }
        })]));
      });
    });
    return { accepted: accepted, conflicted: conflicted };
  }

  function build(loadResults, validator, semanticValidator, extraDiagnostics) {
    var phase1 = classify(loadResults, validator, semanticValidator);
    var phase2 = splitDuplicates(phase1.candidates);

    var available = phase2.accepted.map(function (c) {
      return Object.freeze({
        protocolId: c.identity.protocolId,
        version: c.identity.version,
        name: c.identity.name,
        filePath: c.filePath,
        document: deepFreeze(c.document)
      });
    }).sort(function (a, b) {
      return a.protocolId.localeCompare(b.protocolId) || a.version.localeCompare(b.version);
    });

    var invalid = phase1.invalid.concat(phase2.conflicted).sort(function (a, b) {
      return String(a.filePath).localeCompare(String(b.filePath));
    });

    var diagnostics = (extraDiagnostics || []).slice();
    invalid.forEach(function (e) { diagnostics = diagnostics.concat(e.diagnostics); });

    return Object.freeze({
      available: Object.freeze(available),
      invalid: Object.freeze(invalid),
      diagnostics: Object.freeze(diagnostics),
      counts: Object.freeze({
        available: available.length,
        invalid: invalid.length,
        diagnostics: diagnostics.length
      })
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ProtocolRegistry = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
