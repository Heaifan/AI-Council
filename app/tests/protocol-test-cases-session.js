/* AI Council v0.1 — D1-R1 用例：Session 冻结（第42题）与纯本地运行静态审计。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;

  /* 只审计应用自身源码；app/tests/ 与 app/vendor/ 不在审计范围内 */
  var FORBIDDEN_APIS = [
    "setInterval(", "setTimeout(", "requestAnimationFrame(",
    "XMLHttpRequest", "fetch(", "WebSocket", "EventSource",
    "FileSystemObserver", "serviceWorker"
  ];

  T.test("TEST-08", "修改磁盘后已初始化的 Registry 不得变化", function (ctx) {
    var disk = { text: ctx.validText };
    var entries = [F.schemaEntry(ctx.schemaText), F.liveProtocolEntry("live", disk)];
    return A.FileSource.fromEntries(entries, "test-root").then(function (snapshot) {
      var session = A.ProtocolSession.initialize(snapshot);
      T.assertEqual(session.registry.available[0].protocolId, "committee-mvp", "初始内容");

      disk.text = F.withId(ctx.validText, "mutated-on-disk");   // 模拟用户在资源管理器里改文件

      T.assertEqual(session.registry.available[0].protocolId, "committee-mvp", "Registry 不得随磁盘变化");
      T.assertEqual(session.registry.counts.available, 1, "Available 数量不得变化");
      T.assert(Object.isFrozen(session), "Session 必须冻结");
      T.assert(Object.isFrozen(session.registry), "Registry 必须冻结");
      T.assert(Object.isFrozen(session.registry.available[0].document), "Protocol 文档必须冻结");
      T.assert(Object.isFrozen(snapshot.protocolFiles[0]), "Snapshot 条目必须冻结");
    });
  });

  T.test("TEST-09", "重新初始化整个 Session 后才读取新内容", function (ctx) {
    var disk = { text: ctx.validText };
    var entries = [F.schemaEntry(ctx.schemaText), F.liveProtocolEntry("live", disk)];
    return A.FileSource.fromEntries(entries, "test-root").then(function (snapshot1) {
      var first = A.ProtocolSession.initialize(snapshot1);
      disk.text = F.withId(ctx.validText, "reloaded-protocol");
      return A.FileSource.fromEntries(entries, "test-root").then(function (snapshot2) {
        var second = A.ProtocolSession.initialize(snapshot2);
        T.assertEqual(first.registry.available[0].protocolId, "committee-mvp", "旧 Session 保持不变");
        T.assertEqual(second.registry.available[0].protocolId, "reloaded-protocol", "新 Session 读取新内容");
        T.assert(first.sessionId !== second.sessionId, "必须是两个不同 Session");
      });
    });
  });

  T.test("TEST-10", "纯本地运行静态审计：无网络、无轮询、无 CDN", function (ctx) {
    var sources = ctx.appSources || {};
    var paths = Object.keys(sources);
    T.assert(paths.length >= 8, "未采集到应用源码，无法审计（实际 " + paths.length + " 个文件）");

    paths.forEach(function (p) {
      FORBIDDEN_APIS.forEach(function (api) {
        T.assert(sources[p].indexOf(api) < 0, p + " 含被禁止的 API：" + api);
      });
    });

    var html = sources["app/index.html"];
    T.assert(typeof html === "string", "未采集到 app/index.html");
    T.assert(html.indexOf('src="http') < 0 && html.indexOf("src='http") < 0, "index.html 不得引用远程脚本（禁止 CDN）");
    T.assert(html.indexOf('href="http') < 0 && html.indexOf("href='http") < 0, "index.html 不得引用远程样式");
    T.assert(html.indexOf('src="vendor/ajv2020.bundle.js"') >= 0, "index.html 必须本地引用 Ajv 打包文件");
    T.assert(html.indexOf('type="module"') < 0, "file:// 下不得使用 ES Module，保证双击即运行");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
