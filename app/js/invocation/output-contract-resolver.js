/* AI Council v0.1 — MEETING-INTEGRITY-F1-B · OutputContractResolver
 * Transport 成功 ≠ Runtime 接受：Raw → 严格解析 → Schema/小节校验 → 归一化 → ValidationResult。
 * strict JSON：整串 JSON.parse（BOM/首尾空白/CRLF 归一后），trailing/leading prose 天然抛错，
 * 禁止截取/正则修复。形状：{mode,is_valid,parser_error,schema_errors[],missing_sections[],additional_properties[],normalized_content}。
 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  function norm(raw) {
    return String(raw === undefined || raw === null ? "" : raw)
      .replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  }
  function resolve(packet) {
    var oc = (packet && packet.output_contract) || { mode: "text" };
    return { mode: oc.mode === "structured_json" ? "structured_json" : "text",
      json_schema: (oc.mode === "structured_json" && oc.json_schema && typeof oc.json_schema === "object") ? oc.json_schema : null,
      required_sections: Array.isArray(oc.required_sections) ? oc.required_sections.slice() : [] };
  }
  function isHeading(line, name) {
    var t = line.trim();
    return t === name || t === "# " + name || t === "## " + name || t === "### " + name;
  }
  /* text：required_sections 逐段定位（标题独占行），缺失或空 → missing_sections。 */
  function validateText(raw, sections) {
    var missing = [], lines = norm(raw).split("\n");
    for (var i = 0; i < sections.length; i++) {
      var name = sections[i], start = -1, content = [];
      for (var j = 0; j < lines.length && start < 0; j++) if (isHeading(lines[j], name)) start = j;
      if (start < 0) { missing.push(name); continue; }
      for (var k = start + 1; k < lines.length; k++) {
        var next = false;
        for (var s = 0; s < sections.length && !next; s++) if (s !== i && isHeading(lines[k], sections[s])) next = true;
        if (next) break;
        if (lines[k].trim()) content.push(lines[k].trim());
      }
      if (!content.length) missing.push(name);
    }
    return { missing_sections: missing, normalized_content: norm(raw) };
  }
  /* structured_json：整串解析 + json_schema 校验（additionalProperties 由 schema 强制）。 */
  function validateJson(raw, schema) {
    var out = { parser_error: null, schema_errors: [], additional_properties: [], normalized_content: null };
    var text = norm(raw);
    if (!text) { out.parser_error = "空响应。"; return out; }
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { out.parser_error = "JSON 解析失败（含多余内容或语法错误）：" + e.message; return out; }
    if (!schema) { out.normalized_content = parsed; return out; }
    var c = compile(schema);
    if (c.errors) { out.schema_errors = c.errors; return out; }
    if (!c.fn(parsed)) {
      (c.fn.errors || []).forEach(function (er) {
        var path = String(er.instancePath || "/").replace(/^\//, "");
        out.schema_errors.push((path ? "$." + path + " " : "") + (er.message || ""));
        if (er.keyword === "additionalProperties") {
          out.additional_properties.push(er.params && er.params.additionalProperty ? er.params.additionalProperty : path);
        }
      });
      return out;
    }
    out.normalized_content = parsed;
    return out;
  }
  /* 主入口：raw + contract → ValidationResult（is_valid 恒存在；normalized 仅 PASS 非 null）。 */
  function validate(raw, contract) {
    contract = contract || { mode: "text", json_schema: null, required_sections: [] };
    var r = { mode: contract.mode, is_valid: false, parser_error: null,
      schema_errors: [], missing_sections: [], additional_properties: [], normalized_content: null };
    if (contract.mode === "structured_json") {
      var j = validateJson(raw, contract.json_schema);
      r.parser_error = j.parser_error; r.schema_errors = j.schema_errors;
      r.additional_properties = j.additional_properties; r.normalized_content = j.normalized_content;
    } else {
      var t = validateText(raw, contract.required_sections);
      r.missing_sections = t.missing_sections; r.normalized_content = t.normalized_content;
    }
    r.is_valid = !r.parser_error && r.schema_errors.length === 0 && r.missing_sections.length === 0;
    return r;
  }
  /* Ajv 编译缓存（AjvBundle 与 protocol-schema-validator 同源）。 */
  var cache = Object.create(null);
  function compile(schema) {
    var key = JSON.stringify(schema);
    if (cache[key]) return cache[key];
    var b = root.AjvBundle;
    if (!b) return { errors: ["vendor/ajv2020.bundle.js 未加载"] };
    try { cache[key] = { fn: new (b.default || b.Ajv2020 || b)({ allErrors: true }).compile(schema) }; }
    catch (e) { return { errors: ["Schema 编译失败：" + e.message] }; }
    return cache[key];
  }
  root.AICouncil = root.AICouncil || {};
  root.AICouncil.OutputContractResolver = Object.freeze({ resolve: resolve, validate: validate, _compile: compile });
})(typeof globalThis !== "undefined" ? globalThis : this);
