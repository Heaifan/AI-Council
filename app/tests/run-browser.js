/* AI Council v0.1 — D1-R1 浏览器真机验收（仅开发期工具）。
 * 用真实 Chrome / Edge 打开 file:// 下的 index.html，不启动任何服务器。
 * 依赖 playwright-core（开发期），正式应用运行不依赖它，也不依赖 Node.js。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const repoRoot = path.resolve(__dirname, "..", "..");
const appUrl = "file:///" + path.join(repoRoot, "app", "index.html").replace(/\\/g, "/");
const testUrl = "file:///" + path.join(repoRoot, "app", "tests", "test-runner.html").replace(/\\/g, "/");
const fixtureDir = path.join(repoRoot, "app", "tests", "fixtures", "acceptance");
const schemaFile = path.join(repoRoot, "schema", "schemas", "protocol.schema.json");
const brokenFile = path.join(fixtureDir, "protocols", "broken-b", "protocol.json");
const shotDir = path.join(repoRoot, "reports", "d1-r1-screenshots");

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail: detail || "" });
  console.log((condition ? "PASS  " : "FAIL  ") + label + (condition ? "" : "  → " + detail));
}

const statusText = (page) => page.locator("#status").innerText();
const waitStatus = (page, re) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status").textContent), re.source, { timeout: 30000 });

async function runChannel(channel) {
  console.log("\n=== " + channel + " ===");
  const browser = await chromium.launch({ channel, headless: false });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });

  // 1. 方案 A：选择仓库根目录，自动发现 schema/schemas/protocol.schema.json
  await page.goto(appUrl);
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /Available/);
  let text = await statusText(page);
  check(channel + " · 仓库根目录：Available 1 / Invalid 0", /Available 1 · Invalid 0/.test(text), text);
  check(channel + " · Schema 自动发现", (await page.locator(".card").first().innerText()).includes("schema/schemas/protocol.schema.json"));
  await page.screenshot({ path: path.join(shotDir, channel + "-01-repo-root.png"), fullPage: true });

  // 2. 选择无 schemas/ 的样例目录 → Session 应被阻塞而不是静默通过
  await page.setInputFiles("#dir-input", fixtureDir);
  await waitStatus(page, /未初始化/);
  check(channel + " · 缺少 Schema 时明确阻塞", (await page.locator("#output").innerText()).includes("SCHEMA_SOURCE_MISSING"));

  // 3. 指定正式 Schema 文件 → 隔离与重复检测
  await page.setInputFiles("#schema-input", schemaFile);
  await waitStatus(page, /Available/);
  text = await statusText(page);
  check(channel + " · 样例目录：Available 2 / Invalid 4", /Available 2 · Invalid 4/.test(text), text);
  const body = await page.locator("#output").innerText();
  ["JSON_PARSE_FAILED", "SCHEMA_VALIDATION_FAILED", "DUPLICATE_PROTOCOL"].forEach((code) =>
    check(channel + " · 隔离区显示 " + code, body.includes(code)));
  check(channel + " · 合法规则不受坏规则影响", body.includes("good-a") && body.includes("good-c"));
  await page.locator("#output details").first().click();
  await page.screenshot({ path: path.join(shotDir, channel + "-02-quarantine.png"), fullPage: true });

  // 4. 第42题：改磁盘不刷新页面，Registry 必须不变
  const original = fs.readFileSync(brokenFile, "utf8");
  try {
    fs.writeFileSync(brokenFile, fs.readFileSync(path.join(fixtureDir, "protocols", "good-a", "protocol.json"), "utf8"));
    await page.waitForTimeout(2000);
    text = await statusText(page);
    check(channel + " · 修改磁盘后 Registry 不变", /Available 2 · Invalid 4/.test(text), text);
  } finally {
    fs.writeFileSync(brokenFile, original);
  }

  // 5. 自动测试页
  await page.goto(testUrl);
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /总计/);
  text = await statusText(page);
  check(channel + " · 测试页 12/12 通过", /总计 12 · 通过 12 · 失败 0/.test(text), text);
  await page.screenshot({ path: path.join(shotDir, channel + "-03-tests.png"), fullPage: true });

  await browser.close();
}

(async () => {
  fs.mkdirSync(shotDir, { recursive: true });
  for (const channel of ["chrome", "msedge"]) await runChannel(channel);
  const failed = checks.filter((c) => !c.ok);
  console.log("\n总计 " + checks.length + " · 通过 " + (checks.length - failed.length) + " · 失败 " + failed.length);
  process.exit(failed.length ? 1 : 0);
})();
