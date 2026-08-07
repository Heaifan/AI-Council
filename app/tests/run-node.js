/* AI Council v0.1 — D1-R1 命令行测试入口（仅开发期工具）。
 * 正式应用运行不依赖 Node.js：这里加载的是与浏览器完全相同的 app/js/*.js 与 app/tests/*.js。
 * 用法：node app/tests/run-node.js   （工作目录为仓库根）
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const RUNTIME = [
  "app/vendor/ajv2020.bundle.js",
  "app/js/protocol-diagnostic.js",
  "app/js/protocol-file-source.js",
  "app/js/protocol-loader.js",
  "app/js/protocol-schema-validator.js",
  "app/js/protocol-registry.js",
  "app/js/protocol-session.js",
  "app/tests/protocol-test-suite.js",
  "app/tests/protocol-test-fixtures.js",
  "app/tests/protocol-test-cases.js",
  "app/tests/protocol-test-cases-session.js"
];

const AUDITED = [
  "app/index.html",
  "app/js/app.js",
  "app/js/protocol-diagnostic.js",
  "app/js/protocol-file-source.js",
  "app/js/protocol-loader.js",
  "app/js/protocol-schema-validator.js",
  "app/js/protocol-registry.js",
  "app/js/protocol-session.js",
  "app/js/ui/dom.js",
  "app/js/ui/diagnostic-view.js",
  "app/js/ui/registry-view.js"
];

RUNTIME.forEach((rel) => vm.runInThisContext(read(rel), { filename: rel }));

const appSources = {};
AUDITED.forEach((rel) => { appSources[rel] = read(rel); });

const ctx = {
  schemaText: read("schema/schemas/protocol.schema.json"),
  validText: read("schema/examples/valid-protocol-committee-mvp.json"),
  invalidSchemaText: read("schema/examples/invalid-protocol-schema.json"),
  invalidSemanticText: read("schema/examples/invalid-protocol-semantic.json"),
  appSources
};

globalThis.AICouncil.TestSuite.run(ctx).then((summary) => {
  summary.results.forEach((r) => {
    console.log((r.passed ? "PASS  " : "FAIL  ") + r.id.padEnd(8) + r.name + (r.passed ? "" : "\n        → " + r.message));
  });
  console.log("\n总计 " + summary.total + " · 通过 " + summary.passed + " · 失败 " + summary.failed);
  process.exit(summary.failed ? 1 : 0);
});
