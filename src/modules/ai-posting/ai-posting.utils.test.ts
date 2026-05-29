import test from "node:test";
import assert from "node:assert/strict";
import { SiteCategory } from "@prisma/client";

import {
  AI_POSTING_MAX_TARGETS,
  buildFallbackArticleHtml,
  extractPageData,
  inferTaskForSite,
  validateAiPostingPayload,
} from "./ai-posting.utils";

test("validateAiPostingPayload accepts multiple sites without task type", () => {
  const result = validateAiPostingPayload({
    targetUrl: "https://example.com/service",
    brandName: "Example Brand",
    targets: [{ siteId: "site_1" }, { siteName: "Aidteck" }],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.targets.length, 2);
    assert.equal(result.value.brandName, "Example Brand");
  }
});

test("validateAiPostingPayload rejects missing targets and invalid urls", () => {
  const invalidUrl = validateAiPostingPayload({ targetUrl: "notaurl", targets: [{ siteId: "x" }] });
  assert.equal(invalidUrl.ok, false);

  const missingTargets = validateAiPostingPayload({ targetUrl: "https://example.com", targets: [] });
  assert.equal(missingTargets.ok, false);
});

test("validateAiPostingPayload enforces max target limit", () => {
  const targets = Array.from({ length: AI_POSTING_MAX_TARGETS + 1 }, (_, index) => ({ siteId: `site_${index}` }));
  const result = validateAiPostingPayload({
    targetUrl: "https://example.com",
    targets,
  });
  assert.equal(result.ok, false);
});

test("inferTaskForSite falls back from category or supportedTasks", () => {
  assert.equal(
    inferTaskForSite({ category: SiteCategory.ARTICLE, config: { supportedTasks: [] } }),
    "article"
  );
  assert.equal(
    inferTaskForSite({ category: SiteCategory.MULTI_TASK, config: { supportedTasks: ["profile"] } }),
    "profile"
  );
});

test("extractPageData strips html and detects meaningful content", () => {
  const extracted = extractPageData(`
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

  assert.equal(extracted.title, "Example Service");
  assert.equal(extracted.h1, "Premium Local Service");
  assert.match(extracted.contentText, /first paragraph/);
});

test("buildFallbackArticleHtml includes hyperlink and conclusion", () => {
  const html = buildFallbackArticleHtml({
    brandName: "Aidteck",
    targetUrl: "https://example.com/page",
    title: "Aidteck Overview",
  });

  assert.match(html, /<a href="https:\/\/example\.com\/page"/);
  assert.match(html, /Conclusion:/);
});

