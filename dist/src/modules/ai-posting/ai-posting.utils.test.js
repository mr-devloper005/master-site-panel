"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const client_1 = require("@prisma/client");
const ai_posting_utils_1 = require("./ai-posting.utils");
(0, node_test_1.default)("validateAiPostingPayload accepts multiple sites without task type", () => {
    const result = (0, ai_posting_utils_1.validateAiPostingPayload)({
        targetUrl: "https://example.com/service",
        brandName: "Example Brand",
        targets: [{ siteId: "site_1" }, { siteName: "Aidteck" }],
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.value.targets.length, 2);
        strict_1.default.equal(result.value.brandName, "Example Brand");
    }
});
(0, node_test_1.default)("validateAiPostingPayload rejects missing targets and invalid urls", () => {
    const invalidUrl = (0, ai_posting_utils_1.validateAiPostingPayload)({ targetUrl: "notaurl", targets: [{ siteId: "x" }] });
    strict_1.default.equal(invalidUrl.ok, false);
    const missingTargets = (0, ai_posting_utils_1.validateAiPostingPayload)({ targetUrl: "https://example.com", targets: [] });
    strict_1.default.equal(missingTargets.ok, false);
});
(0, node_test_1.default)("validateAiPostingPayload enforces max target limit", () => {
    const targets = Array.from({ length: ai_posting_utils_1.AI_POSTING_MAX_TARGETS + 1 }, (_, index) => ({ siteId: `site_${index}` }));
    const result = (0, ai_posting_utils_1.validateAiPostingPayload)({
        targetUrl: "https://example.com",
        targets,
    });
    strict_1.default.equal(result.ok, false);
});
(0, node_test_1.default)("inferTaskForSite falls back from category or supportedTasks", () => {
    strict_1.default.equal((0, ai_posting_utils_1.inferTaskForSite)({ category: client_1.SiteCategory.ARTICLE, config: { supportedTasks: [] } }), "article");
    strict_1.default.equal((0, ai_posting_utils_1.inferTaskForSite)({ category: client_1.SiteCategory.MULTI_TASK, config: { supportedTasks: ["profile"] } }), "profile");
});
(0, node_test_1.default)("extractPageData strips html and detects meaningful content", () => {
    const extracted = (0, ai_posting_utils_1.extractPageData)(`
    <html>
      <head>
        <title>Example Service</title>
        <meta name="description" content="Fast service for local clients" />
      </head>
      <body>
        <header>ignore me</header>
        <h1>Premium Local Service</h1>
        <p>This is the first paragraph with useful information.</p>
        <p>This is the second paragraph with enough text to cross the content threshold for AI generation and meaningful extraction.</p>
      </body>
    </html>
  `);
    strict_1.default.equal(extracted.title, "Example Service");
    strict_1.default.equal(extracted.h1, "Premium Local Service");
    strict_1.default.match(extracted.contentText, /first paragraph/);
});
(0, node_test_1.default)("buildFallbackArticleHtml includes hyperlink and conclusion", () => {
    const html = (0, ai_posting_utils_1.buildFallbackArticleHtml)({
        brandName: "Aidteck",
        targetUrl: "https://example.com/page",
        title: "Aidteck Overview",
    });
    strict_1.default.match(html, /<a href="https:\/\/example\.com\/page"/);
    strict_1.default.match(html, /Conclusion:/);
});
