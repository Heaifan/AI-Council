/* AI Council v0.1 — D1-R1 测试骨架（浏览器与 Node 共用）。 */
(function (root) {
  "use strict";

  var cases = [];

  function test(id, name, fn) { cases.push({ id: id, name: name, fn: fn }); }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "断言失败");
  }

  function assertEqual(actual, expected, label) {
    if (actual !== expected) {
      throw new Error((label || "值") + "：期望 " + JSON.stringify(expected) + "，实际 " + JSON.stringify(actual));
    }
  }

  function runOne(item, ctx) {
    return Promise.resolve()
      .then(function () { return item.fn(ctx); })
      .then(function () { return { id: item.id, name: item.name, passed: true, message: "OK" }; })
      .catch(function (e) {
        return { id: item.id, name: item.name, passed: false, message: (e && e.message) ? e.message : String(e) };
      });
  }

  function run(ctx) {
    var results = [];
    return cases.reduce(function (chain, item) {
      return chain.then(function () {
        return runOne(item, ctx).then(function (r) { results.push(r); });
      });
    }, Promise.resolve()).then(function () {
      var failed = results.filter(function (r) { return !r.passed; });
      return { results: results, total: results.length, failed: failed.length, passed: results.length - failed.length };
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.TestSuite = { test: test, assert: assert, assertEqual: assertEqual, run: run, cases: cases };
})(typeof globalThis !== "undefined" ? globalThis : this);
