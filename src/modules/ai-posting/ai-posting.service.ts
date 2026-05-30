import { ApiActivityStatus, AiPostingJobStatus, AiPostingRunStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { ensureSiteAccess } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { createPublishedPost } from "../posts/post-service";
import type { SiteTask } from "../sites/site-contract";
import { enforceUserPostPolicy, logApiActivity } from "../users/user-access-service";
import { getResolvedAiPostingSettings } from "../settings/ai-posting-settings-service";
import {
  AI_POSTING_DEFAULT_WORD_COUNT,
  buildFallbackArticleHtml,
  extractPageData,
  inferTaskForSite,
  type AiPostingTargetInput,
  type CrawlResult,
  validateAiPostingPayload,
} from "./ai-posting.utils";

type ApiKeyContext = {
  id: string;
  scopes: string[];
  userId?: string | null;
  name?: string | null;
};

type RequestMeta = {
  ipAddress?: string | null;
  method?: string | null;
  path?: string | null;
};

type ResolvedTarget = {
  siteId: string;
  siteCode: string;
  siteName: string;
  taskKey: string;
};

const syncUserSiteAccessToInferredTask = async ({
  apiKey,
  siteId,
  taskKey,
}: {
  apiKey: ApiKeyContext;
  siteId: string;
  taskKey: string;
}) => {
  if (!apiKey.userId) return false;

  const exact = await prisma.userSiteTaskAccess.findUnique({
    where: {
      userId_siteId_taskKey: {
        userId: apiKey.userId,
        siteId,
        taskKey,
      },
    },
  });

  if (exact?.isActive) {
    return true;
  }

  const fallback = await prisma.userSiteTaskAccess.findFirst({
    where: {
      userId: apiKey.userId,
      siteId,
      isActive: true,
      canPost: true,
    },
    orderBy: [
      { canDelete: "desc" },
      { canEdit: "desc" },
      { updatedAt: "desc" },
    ],
  });

  if (!fallback) {
    return false;
  }

  await prisma.userSiteTaskAccess.upsert({
    where: {
      userId_siteId_taskKey: {
        userId: apiKey.userId,
        siteId,
        taskKey,
      },
    },
    create: {
      userId: apiKey.userId,
      siteId,
      taskKey,
      canRead: fallback.canRead,
      canPost: fallback.canPost,
      canEdit: fallback.canEdit,
      canDelete: fallback.canDelete,
      perMinuteLimit: fallback.perMinuteLimit,
      dailyLimit: fallback.dailyLimit,
      totalLimit: fallback.totalLimit,
      isActive: true,
    },
    update: {
      canRead: fallback.canRead,
      canPost: fallback.canPost,
      canEdit: fallback.canEdit,
      canDelete: fallback.canDelete,
      perMinuteLimit: fallback.perMinuteLimit,
      dailyLimit: fallback.dailyLimit,
      totalLimit: fallback.totalLimit,
      isActive: true,
    },
  });

  return true;
};

const AI_POSTING_USER_AGENT = env.aiPostingUserAgent;
const AI_POSTING_MAX_SOURCE_CHARS = 3000;
const AI_POSTING_MAX_OUTPUT_TOKENS = 1400;
const AI_POSTING_RUN_CONCURRENCY = 20;
const AI_POSTING_OPENAI_TIMEOUT_MS = 20000;

const resolveReasoningEffort = (_model: string) => {
  return "none";
};

const summarizeRuns = (runs: Array<{ status: AiPostingRunStatus }>) => {
  const summary = { total: runs.length, completed: 0, pending: 0, failed: 0, processing: 0 };
  for (const run of runs) {
    if (run.status === AiPostingRunStatus.COMPLETED) summary.completed += 1;
    else if (run.status === AiPostingRunStatus.FAILED) summary.failed += 1;
    else if (run.status === AiPostingRunStatus.PROCESSING) summary.processing += 1;
    else summary.pending += 1;
  }
  return summary;
};

const chunkRuns = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const mapJobStatusFromRuns = (runs: Array<{ status: AiPostingRunStatus }>): AiPostingJobStatus => {
  const summary = summarizeRuns(runs);
  if (summary.failed === summary.total) return AiPostingJobStatus.FAILED;
  if (summary.completed === summary.total) return AiPostingJobStatus.COMPLETED;
  if (summary.completed > 0 && summary.failed > 0) return AiPostingJobStatus.PARTIAL;
  return AiPostingJobStatus.PROCESSING;
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "user-agent": AI_POSTING_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const crawlTargetUrl = async ({
  targetUrl,
  retryOn404,
  timeoutMs,
}: {
  targetUrl: string;
  retryOn404: boolean;
  timeoutMs: number;
}): Promise<CrawlResult> => {
  let lastStatus: number | undefined;
  let lastError = "";
  let finalUrl = targetUrl;
  const maxAttempts = retryOn404 ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(targetUrl, timeoutMs);
      lastStatus = response.status;
      finalUrl = response.url || targetUrl;

      if (response.status === 404) {
        lastError = "Given URL returned 404 and could not be reached after retry.";
        if (attempt === 1 && retryOn404) continue;
        return { ok: false, finalUrl, httpStatus: 404, errorMessage: lastError, attempts: attempt };
      }

      if (!response.ok) {
        lastError = `Given URL not reached. HTTP ${response.status}.`;
        if (attempt === 1 && retryOn404 && response.status >= 500) continue;
        return { ok: false, finalUrl, httpStatus: response.status, errorMessage: lastError, attempts: attempt };
      }

      const html = await response.text();
      return { ok: true, finalUrl, httpStatus: response.status, html, attempts: attempt };
    } catch (error) {
      lastError = "Given URL not reached.";
      if (attempt === maxAttempts) {
        return {
          ok: false,
          finalUrl,
          httpStatus: lastStatus,
          errorMessage: error instanceof Error && error.name === "AbortError" ? "Given URL not reached." : lastError,
          attempts: attempt,
        };
      }
    }
  }

  return { ok: false, finalUrl, httpStatus: lastStatus, errorMessage: lastError || "Given URL not reached.", attempts: maxAttempts };
};

const buildGenerationPrompt = ({
  brandName,
  targetUrl,
  extracted,
  taskKey,
  siteName,
}: {
  brandName: string | null;
  targetUrl: string;
  extracted: ReturnType<typeof extractPageData>;
  taskKey: string;
  siteName: string;
}) => {
  const brand = brandName || extracted.h1 || extracted.title || siteName;
  return [
    "Generate a fast publishing-ready post in HTML.",
    `Task type: ${taskKey}`,
    `Target brand: ${brand}`,
    `Source URL: ${targetUrl}`,
    `Site name: ${siteName}`,
    "Requirements:",
    "- Write 450 to 550 words.",
    "- Respond quickly and directly. Do not overthink or add extra analysis.",
    "- Use clear, natural English.",
    "- Use the real brand/business/page name from the source. Never invent placeholder names like ABC Services, Example Brand, Sample Company, or generic initials.",
    "- Include exactly one hyperlink to the source URL inside the body.",
    "- Mention the brand naturally throughout the article.",
    "- Start with a short introduction paragraph before the first heading.",
    "- Use 3 to 5 <h2> subheadings in the html body.",
    "- Each <h2> section must have supporting <p> paragraphs beneath it.",
    "- End with a short conclusion paragraph.",
    "- Return valid JSON only with keys: title, summary, html, tags, featuredImage.",
    "- html must contain multiple <p> tags, multiple <h2> tags, and no markdown fences.",
    "- Do not use <h1> inside html.",
    `Page title: ${extracted.title || "N/A"}`,
    `Page H1: ${extracted.h1 || "N/A"}`,
    `Meta description: ${extracted.metaDescription || "N/A"}`,
    `Extracted content: ${extracted.contentText.slice(0, AI_POSTING_MAX_SOURCE_CHARS) || "Limited source content available."}`,
  ].join("\n");
};

const extractResponseText = (payload: Record<string, unknown>): string => {
  const direct = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
  if (direct) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: Array<Record<string, unknown>> }).content
      : [];

    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.text === "string" && entry.text.trim()) {
        chunks.push(entry.text.trim());
      }
      const nestedText = (entry as { output_text?: string }).output_text;
      if (typeof nestedText === "string" && nestedText.trim()) {
        chunks.push(nestedText.trim());
      }
    }
  }

  return chunks.join("\n").trim();
};

const callOpenAiForContent = async ({
  brandName,
  targetUrl,
  extracted,
  taskKey,
  siteName,
  model,
  apiKey,
  openAiApiUrl,
}: {
  brandName: string | null;
  targetUrl: string;
  extracted: ReturnType<typeof extractPageData>;
  taskKey: string;
  siteName: string;
  model: string;
  apiKey: string;
  openAiApiUrl: string;
}) => {
  if (!apiKey) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured.");
  }

  const prompt = buildGenerationPrompt({ brandName, targetUrl, extracted, taskKey, siteName });
  const reasoningEffort = resolveReasoningEffort(model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_POSTING_OPENAI_TIMEOUT_MS);
  const response = await fetch(openAiApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: AI_POSTING_MAX_OUTPUT_TOKENS,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "ai_posting_payload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              html: { type: "string" },
              tags: {
                type: "array",
                items: { type: "string" },
              },
              featuredImage: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
            required: ["title", "summary", "html", "tags", "featuredImage"],
          },
        },
      },
      reasoning: { effort: reasoningEffort },
    }),
    signal: controller.signal,
  }).catch((error) => {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(504, "OpenAI generation timed out.");
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(502, `OpenAI generation failed: ${body.slice(0, 400)}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const raw = extractResponseText(payload);
  if (!raw) {
    throw new ApiError(502, "OpenAI generation returned empty output.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(502, "OpenAI generation returned invalid JSON.");
  }

  const title = String(parsed.title || extracted.h1 || extracted.title || brandName || siteName).trim();
  const summary = String(parsed.summary || extracted.metaDescription || "").trim();
  const html = String(parsed.html || "").trim();
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map((item) => String(item).trim()).filter(Boolean) : [];
  const featuredImage = typeof parsed.featuredImage === "string" ? parsed.featuredImage.trim() : extracted.logoUrl || null;

  if (!title || !html) {
    throw new ApiError(502, "OpenAI generation returned incomplete content.");
  }

  return {
    title,
    summary,
    html,
    tags,
    featuredImage,
  };
};

const buildGeneratedPostPayload = ({
  taskKey,
  generated,
  targetUrl,
  brandName,
}: {
  taskKey: string;
  generated: { title: string; summary: string; html: string; tags: string[]; featuredImage: string | null };
  targetUrl: string;
  brandName: string | null;
}) => {
  const content: Record<string, unknown> = {
    type: taskKey,
    category: "uncategorised",
    sourceUrl: targetUrl,
    description: generated.html,
    excerpt: generated.summary,
  };

  if (brandName) {
    content.brandName = brandName;
  }

  if (generated.featuredImage) {
    content.featuredImage = generated.featuredImage;
    content.image = generated.featuredImage;
    content.images = [generated.featuredImage];
  }

  return {
    title: generated.title,
    summary: generated.summary,
    content,
    media: generated.featuredImage
      ? [{ url: generated.featuredImage, type: "IMAGE" }]
      : [],
    tags: generated.tags,
  };
};

const buildFallbackGeneratedPayload = ({
  taskKey,
  title,
  targetUrl,
  brandName,
  extracted,
}: {
  taskKey: string;
  title: string;
  targetUrl: string;
  brandName: string | null;
  extracted: ReturnType<typeof extractPageData>;
}) => {
  const fallbackTitle = title || extracted.h1 || extracted.title || brandName || "Website Overview";
  const html = buildFallbackArticleHtml({ brandName, targetUrl, title: fallbackTitle });
  const summary = extracted.metaDescription || `Learn more about ${brandName || fallbackTitle}.`;
  const content: Record<string, unknown> = {
    type: taskKey,
    category: "uncategorised",
    sourceUrl: targetUrl,
    description: html,
    excerpt: summary,
  };

  if (brandName) {
    content.brandName = brandName;
  }

  if (extracted.logoUrl) {
    content.featuredImage = extracted.logoUrl;
    content.image = extracted.logoUrl;
    content.images = [extracted.logoUrl];
  }

  return {
    title: fallbackTitle,
    summary,
    content,
    media: extracted.logoUrl ? [{ url: extracted.logoUrl, type: "IMAGE" }] : [],
    tags: [brandName || fallbackTitle].filter(Boolean),
  };
};

const resolveSiteTarget = async (input: AiPostingTargetInput) => {
  if (input.siteId) {
    return prisma.site.findUnique({ where: { id: input.siteId } });
  }
  if (input.siteCode) {
    return prisma.site.findUnique({ where: { code: input.siteCode } });
  }
  if (input.siteName) {
    const matches = await prisma.site.findMany({
      where: { name: { equals: input.siteName, mode: "insensitive" } },
      take: 2,
    });
    if (matches.length > 1) {
      throw new ApiError(400, `Multiple sites matched siteName "${input.siteName}". Use siteId or siteCode.`);
    }
    return matches[0] || null;
  }
  return null;
};

const resolveTargets = async ({
  apiKey,
  targets,
}: {
  apiKey: ApiKeyContext;
  targets: AiPostingTargetInput[];
}): Promise<ResolvedTarget[]> => {
  const resolved: ResolvedTarget[] = [];
  for (const target of targets) {
    const site = await resolveSiteTarget(target);
    if (!site || !site.isActive) {
      throw new ApiError(404, `Site not found or inactive for target "${target.siteId || target.siteCode || target.siteName}".`);
    }

    const allowed = await ensureSiteAccess(apiKey.id, site.id, "post");
    if (!allowed && !apiKey.scopes.includes("*")) {
      throw new ApiError(403, `API key is not allowed to post on site "${site.name}" (${site.code}).`);
    }

    const taskKey = inferTaskForSite(site);
    if (!taskKey) {
      throw new ApiError(400, `Could not infer task for site "${site.name}".`);
    }

    try {
      await enforceUserPostPolicy({
        apiKey,
        siteId: site.id,
        taskKey,
        action: "post",
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 403) {
        const synced = await syncUserSiteAccessToInferredTask({
          apiKey,
          siteId: site.id,
          taskKey,
        });

        if (synced) {
          await enforceUserPostPolicy({
            apiKey,
            siteId: site.id,
            taskKey,
            action: "post",
          });
        } else {
          throw new ApiError(403, `API key is not allowed for site "${site.name}" (${site.code}) with inferred task "${taskKey}".`);
        }
      } else {
        throw error;
      }
    }

    resolved.push({
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      taskKey,
    });
  }
  return resolved;
};

export const createAiPostingJob = async ({
  apiKey,
  payload,
  requestMeta,
}: {
  apiKey: ApiKeyContext;
  payload: Record<string, unknown>;
  requestMeta?: RequestMeta;
}) => {
  const validated = validateAiPostingPayload(payload);
  if (!validated.ok) {
    throw new ApiError(400, validated.message);
  }

  const settings = await getResolvedAiPostingSettings();
  if (!settings?.isEnabled) {
    throw new ApiError(400, "AI posting is disabled.");
  }
  if (!settings.apiKey) {
    throw new ApiError(400, "AI posting OpenAI key is not configured.");
  }

  const resolvedTargets = await resolveTargets({ apiKey, targets: validated.value.targets });
  const job = await prisma.aiPostingJob.create({
    data: {
      apiKeyId: apiKey.id,
      userId: apiKey.userId || null,
      targetUrl: validated.value.targetUrl,
      brandName: validated.value.brandName,
      model: settings.model,
      language: "en",
      wordCount: settings.defaultWordCount || AI_POSTING_DEFAULT_WORD_COUNT,
      metadata: {
        requestMeta: requestMeta || {},
        source: settings.source,
        retryOn404: settings.retryOn404,
        requestTimeoutMs: settings.requestTimeoutMs,
      } as Prisma.InputJsonValue,
      runs: {
        create: resolvedTargets.map((target) => ({
          siteId: target.siteId,
          taskKey: target.taskKey,
        })),
      },
    },
    include: {
      runs: true,
    },
  });

  if (apiKey.userId) {
    void logApiActivity({
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      action: "ai-posting:create",
      status: ApiActivityStatus.SUCCESS,
      method: requestMeta?.method || "POST",
      path: requestMeta?.path || "/api/v1/ai-posting/jobs",
      ipAddress: requestMeta?.ipAddress || null,
      meta: {
        targetUrl: validated.value.targetUrl,
        targetCount: resolvedTargets.length,
      } as Prisma.InputJsonValue,
    }).catch(() => undefined);
  }

  queueMicrotask(() => {
    processAiPostingJob(job.id).catch((error) => {
      console.error("AI posting job failed", error);
    });
  });

  return {
    jobId: job.id,
    status: job.status,
    targetUrl: validated.value.targetUrl,
    totalTargets: job.runs.length,
    runs: job.runs.map((run) => ({
      taskId: run.id,
      siteId: run.siteId,
      taskKey: run.taskKey,
      status: run.status,
    })),
  };
};

export const getAiPostingJobStatus = async ({
  jobId,
  apiKey,
}: {
  jobId: string;
  apiKey: ApiKeyContext;
}) => {
  const job = await prisma.aiPostingJob.findUnique({
    where: { id: jobId },
    include: {
      runs: {
        include: {
          site: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) {
    throw new ApiError(404, "AI posting job not found.");
  }

  if (job.apiKeyId !== apiKey.id && !apiKey.scopes.includes("*")) {
    throw new ApiError(403, "You do not have access to this AI posting job.");
  }

  const summary = summarizeRuns(job.runs);
  return {
    success: true,
    jobId: job.id,
    status: job.status,
    targetUrl: job.targetUrl,
    finalUrl: job.finalUrl,
    message: job.errorMessage || null,
    summary,
    runs: job.runs.map((run) => ({
      taskId: run.id,
      siteId: run.siteId,
      siteCode: run.site.code,
      siteName: run.site.name,
      taskKey: run.taskKey,
      status: run.status,
      liveUrl: run.liveUrl,
      message: run.errorMessage || (run.status === AiPostingRunStatus.COMPLETED ? "Post published successfully." : null),
    })),
  };
};

export const listAiPostingJobs = async ({
  apiKey,
  page = 1,
  limit = 20,
  status,
  search,
}: {
  apiKey: ApiKeyContext;
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) => {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
  const where: Prisma.AiPostingJobWhereInput = {};

  if (!apiKey.scopes.includes("*")) {
    where.apiKeyId = apiKey.id;
  }

  if (status && Object.values(AiPostingJobStatus).includes(status as AiPostingJobStatus)) {
    where.status = status as AiPostingJobStatus;
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    where.OR = [
      { targetUrl: { contains: trimmedSearch, mode: "insensitive" } },
      { brandName: { contains: trimmedSearch, mode: "insensitive" } },
      { runs: { some: { site: { OR: [{ name: { contains: trimmedSearch, mode: "insensitive" } }, { code: { contains: trimmedSearch, mode: "insensitive" } }] } } } },
    ];
  }

  const [total, jobs] = await Promise.all([
    prisma.aiPostingJob.count({ where }),
    prisma.aiPostingJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: {
        runs: {
          include: {
            site: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return {
    data: jobs.map((job) => ({
      jobId: job.id,
      status: job.status,
      targetUrl: job.targetUrl,
      finalUrl: job.finalUrl,
      brandName: job.brandName,
      model: job.model,
      fallbackUsed: job.fallbackUsed,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      message: job.errorMessage || null,
      summary: summarizeRuns(job.runs),
      runs: job.runs.map((run) => ({
        taskId: run.id,
        siteId: run.siteId,
        siteCode: run.site.code,
        siteName: run.site.name,
        taskKey: run.taskKey,
        status: run.status,
        liveUrl: run.liveUrl,
        message: run.errorMessage || null,
      })),
    })),
    meta: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const processAiPostingJob = async (jobId: string) => {
  const job = await prisma.aiPostingJob.findUnique({
    where: { id: jobId },
    include: {
      apiKey: true,
      runs: {
        include: {
          site: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job || !job.apiKey) {
    return;
  }

  const resolvedApiKey = job.apiKey;

  const settings = await getResolvedAiPostingSettings();
  if (!settings?.apiKey) {
    await prisma.aiPostingJob.update({
      where: { id: jobId },
      data: {
        status: AiPostingJobStatus.FAILED,
        errorMessage: "OPENAI_API_KEY is not configured.",
        finishedAt: new Date(),
      },
    });

    await prisma.aiPostingRun.updateMany({
      where: { jobId },
      data: {
        status: AiPostingRunStatus.FAILED,
        errorMessage: "OPENAI_API_KEY is not configured.",
        finishedAt: new Date(),
      },
    });
    return;
  }

  await prisma.aiPostingJob.update({
    where: { id: jobId },
    data: {
      status: AiPostingJobStatus.PROCESSING,
      startedAt: new Date(),
    },
  });

  const crawl = await crawlTargetUrl({
    targetUrl: job.targetUrl,
    retryOn404: settings.retryOn404,
    timeoutMs: settings.requestTimeoutMs,
  });

  if (!crawl.ok || !crawl.html) {
    await prisma.aiPostingJob.update({
      where: { id: jobId },
      data: {
        status: AiPostingJobStatus.FAILED,
        finalUrl: crawl.finalUrl || job.targetUrl,
        crawlAttempts: crawl.attempts,
        httpStatus: crawl.httpStatus || null,
        errorMessage: crawl.errorMessage || "Given URL not reached.",
        finishedAt: new Date(),
      },
    });

    await prisma.aiPostingRun.updateMany({
      where: { jobId },
      data: {
        status: AiPostingRunStatus.FAILED,
        errorMessage: crawl.errorMessage || "Given URL not reached.",
        finishedAt: new Date(),
      },
    });
    return;
  }

  const extracted = extractPageData(crawl.html);
  const fallbackUsed = !extracted.hasEnoughContent;

  await prisma.aiPostingJob.update({
    where: { id: jobId },
    data: {
      finalUrl: crawl.finalUrl || job.targetUrl,
      crawlAttempts: crawl.attempts,
      httpStatus: crawl.httpStatus || null,
      extractedData: extracted as Prisma.InputJsonValue,
      fallbackUsed,
    },
  });

  const processRun = async (run: (typeof job.runs)[number]) => {
    await prisma.aiPostingRun.update({
      where: { id: run.id },
      data: {
        status: AiPostingRunStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    try {
      const generated = fallbackUsed
        ? buildFallbackGeneratedPayload({
            taskKey: run.taskKey,
            title: extracted.h1 || extracted.title || job.brandName || run.site.name,
            targetUrl: crawl.finalUrl || job.targetUrl,
            brandName: job.brandName,
            extracted,
          })
        : buildGeneratedPostPayload({
            taskKey: run.taskKey,
            generated: await callOpenAiForContent({
              brandName: job.brandName,
              targetUrl: crawl.finalUrl || job.targetUrl,
              extracted,
            taskKey: run.taskKey,
            siteName: run.site.name,
            model: job.model || settings.model,
            apiKey: settings.apiKey,
            openAiApiUrl: settings.openAiApiUrl,
          }),
            targetUrl: crawl.finalUrl || job.targetUrl,
            brandName: job.brandName,
          });

      const created = await createPublishedPost({
        apiKey: {
          id: resolvedApiKey.id,
          scopes: resolvedApiKey.scopes,
          userId: resolvedApiKey.userId,
        },
        siteCode: run.site.code,
        title: generated.title,
        summary: generated.summary,
        content: generated.content,
        media: generated.media,
        tags: generated.tags,
        authorName: job.brandName || run.site.name,
        requestedTask: run.taskKey as SiteTask,
      });

      await prisma.aiPostingRun.update({
        where: { id: run.id },
        data: {
          status: AiPostingRunStatus.COMPLETED,
          postId: created.post.id,
          liveUrl: created.liveUrl,
          generatedPost: generated as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.aiPostingRun.update({
        where: { id: run.id },
        data: {
          status: AiPostingRunStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : "Run failed",
          finishedAt: new Date(),
        },
      });
    }
  };

  for (const runBatch of chunkRuns(job.runs, AI_POSTING_RUN_CONCURRENCY)) {
    await Promise.all(runBatch.map((run) => processRun(run)));
  }

  const refreshedRuns = await prisma.aiPostingRun.findMany({
    where: { jobId },
    select: { status: true },
  });

  await prisma.aiPostingJob.update({
    where: { id: jobId },
    data: {
      status: mapJobStatusFromRuns(refreshedRuns),
      finishedAt: new Date(),
      errorMessage:
        refreshedRuns.every((run) => run.status === AiPostingRunStatus.FAILED)
          ? "All target runs failed."
          : null,
    },
  });
};
