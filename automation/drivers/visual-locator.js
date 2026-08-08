/* AI Council v0.1 — WEB_AUTOMATION · VisualLocator：视觉定位层接口契约（方案 §十八/§十九/§三十六）。
 * 本文件只冻结接口，不实现任何视觉技术。触发条件（方案 §三十五，满足任一才开发）：
 *   1) ChatGPT DOM Adapter 在多次页面变动中确实不稳定；或
 *   2) 某个网页 AI 根本没有稳定 DOM/ARIA 特征。
 * 实现候选（保持 JS 技术栈）：Template Matcher（OpenCV.js/WASM）、OCR Locator（Tesseract.js）、
 * VLM Locator（截图 + 自然语言描述 → 区域）。三者均为可选 fallback，不做第一层。
 *
 * 约定接口（输入/输出）：
 *   locate({ screenshot, targetDescription, historyTemplates, ocrText }) → {
 *     boundingBox: { x, y, width, height },
 *     confidence: 0..1,
 *     method: "template" | "ocr" | "vlm",
 *     evidence: string
 *   }
 * 上层（ChatGptSiteAdapter 的第四层候选）只消费 boundingBox + confidence；
 * confidence 低于站点阈值时视为未找到，继续走错误路径（LOCATOR_NOT_FOUND）。
 */
"use strict";

module.exports = {
  INTERFACE: true,
  MIN_CONFIDENCE: 0.8,
  methods: ["template", "ocr", "vlm"]
};
