"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAiPostingJob = exports.listAiPostingJobs = exports.getAiPostingJobStatus = exports.createAiPostingJob = void 0;
const client_1 = require("@prisma/client");
const db_1 = require("../../config/db");
const env_1 = require("../../config/env");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const post_service_1 = require("../posts/post-service");
const user_access_service_1 = require("../users/user-access-service");
const ai_posting_settings_service_1 = require("../settings/ai-posting-settings-service");
const ai_posting_utils_1 = require("./ai-posting.utils");
const AI_POSTING_USER_AGENT = env_1.env.aiPostingUserAgent;
const summarizeRuns = (runs) => {
    const summary = { total: runs.length, completed: 0, pending: 0, failed: 0, processing: 0 };
    for (const run of runs) {
        if (run.status === client_1.AiPostingRunStatus.COMPLETED)
            summary.completed += 1;
        else if (run.status === client_1.AiPostingRunStatus.FAILED)
            summary.failed += 1;
        else if (run.status === client_1.AiPostingRunStatus.PROCESSING)
            summary.processing += 1;
        else
            summary.pending += 1;
    }
    return summary;
};
const mapJobStatusFromRuns = (runs) => {
    const summary = summarizeRuns(runs);
    if (summary.failed === summary.total)
        return client_1.AiPostingJobStatus.FAILED;
    if (summary.completed === summary.total)
        return client_1.AiPostingJobStatus.COMPLETED;
    if (summary.completed > 0 && summary.failed > 0)
        return client_1.AiPostingJobStatus.PARTIAL;
    return client_1.AiPostingJobStatus.PROCESSING;
};
const fetchWithTimeout = async (url, timeoutMs) => {
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
    }
    finally {
        clearTimeout(timeout);
    }
};
const crawlTargetUrl = async ({ targetUrl, retryOn404, timeoutMs, }) => {
    let lastStatus;
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
                if (attempt === 1 && retryOn404)
                    continue;
                return { ok: false, finalUrl, httpStatus: 404, errorMessage: lastError, attempts: attempt };
            }
            if (!response.ok) {
                lastError = `Given URL not reached. HTTP ${response.status}.`;
                if (attempt === 1 && retryOn404 && response.status >= 500)
                    continue;
                return { ok: false, finalUrl, httpStatus: response.status, errorMessage: lastError, attempts: attempt };
            }
            const html = await response.text();
            return { ok: true, finalUrl, httpStatus: response.status, html, attempts: attempt };
        }
        catch (error) {
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
const buildGenerationPrompt = ({ brandName, targetUrl, extracted, taskKey, siteName, }) => {
    const brand = brandName || extracted.h1 || extracted.title || siteName;
    return [
        "Generate a unique publishing-ready post in HTML.",
        `Task type: ${taskKey}`,
        `Target brand: ${brand}`,
        `Source URL: ${targetUrl}`,
        `Site name: ${siteName}`,
        "Requirements:",
        "- Write 500 to 600 words.",
        "- Use clear, natural English.",
        "- Include exactly one hyperlink to the source URL inside the body.",
        "- Mention the brand naturally.",
        "- End with a short conclusion paragraph.",
        "- Return valid JSON only with keys: title, summary, html, tags, featuredImage.",
        "- html must contain multiple <p> tags and no markdown fences.",
        `Page title: ${extracted.title || "N/A"}`,
        `Page H1: ${extracted.h1 || "N/A"}`,
        `Meta description: ${extracted.metaDescription || "N/A"}`,
        `Extracted content: ${extracted.contentText.slice(0, 6000) || "Limited source content available."}`,
    ].join("\n");
};
const extractResponseText = (payload) => {
    const direct = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
    if (direct)
        return direct;
    const output = Array.isArray(payload.output) ? payload.output : [];
    const chunks = [];
    for (const item of output) {
        if (!item || typeof item !== "object")
            continue;
        const content = Array.isArray(item.content)
            ? item.content
            : [];
        for (const entry of content) {
            if (!entry || typeof entry !== "object")
                continue;
            if (typeof entry.text === "string" && entry.text.trim()) {
                chunks.push(entry.text.trim());
            }
            const nestedText = entry.output_text;
            if (typeof nestedText === "string" && nestedText.trim()) {
                chunks.push(nestedText.trim());
            }
        }
    }
    return chunks.join("\n").trim();
};
const callOpenAiForContent = async ({ brandName, targetUrl, extracted, taskKey, siteName, model, apiKey, openAiApiUrl, }) => {
    if (!apiKey) {
        throw new api_error_1.ApiError(500, "OPENAI_API_KEY is not configured.");
    }
    const prompt = buildGenerationPrompt({ brandName, targetUrl, extracted, taskKey, siteName });
    const response = await fetch(openAiApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            input: prompt,
            text: {
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
            reasoning: { effort: "none" },
        }),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new api_error_1.ApiError(502, `OpenAI generation failed: ${body.slice(0, 400)}`);
    }
    const payload = await response.json();
    const raw = extractResponseText(payload);
    if (!raw) {
        throw new api_error_1.ApiError(502, "OpenAI generation returned empty output.");
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new api_error_1.ApiError(502, "OpenAI generation returned invalid JSON.");
    }
    const title = String(parsed.title || extracted.h1 || extracted.title || brandName || siteName).trim();
    const summary = String(parsed.summary || extracted.metaDescription || "").trim();
    const html = String(parsed.html || "").trim();
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((item) => String(item).trim()).filter(Boolean) : [];
    const featuredImage = typeof parsed.featuredImage === "string" ? parsed.featuredImage.trim() : extracted.logoUrl || null;
    if (!title || !html) {
        throw new api_error_1.ApiError(502, "OpenAI generation returned incomplete content.");
    }
    return {
        title,
        summary,
        html,
        tags,
        featuredImage,
    };
};
const buildGeneratedPostPayload = ({ taskKey, generated, targetUrl, brandName, }) => ({
    title: generated.title,
    summary: generated.summary,
    content: {
        type: taskKey,
        category: "uncategorised",
        brandName: brandName || null,
        sourceUrl: targetUrl,
        description: generated.html,
        featuredImage: generated.featuredImage,
        image: generated.featuredImage,
    },
    media: generated.featuredImage ? [{ url: generated.featuredImage }] : [],
    tags: generated.tags,
});
const buildFallbackGeneratedPayload = ({ taskKey, title, targetUrl, brandName, extracted, }) => {
    const fallbackTitle = title || extracted.h1 || extracted.title || brandName || "Website Overview";
    const html = (0, ai_posting_utils_1.buildFallbackArticleHtml)({ brandName, targetUrl, title: fallbackTitle });
    return {
        title: fallbackTitle,
        summary: extracted.metaDescription || `Learn more about ${brandName || fallbackTitle}.`,
        content: {
            type: taskKey,
            category: "uncategorised",
            brandName: brandName || null,
            sourceUrl: targetUrl,
            description: html,
            featuredImage: extracted.logoUrl,
            image: extracted.logoUrl,
        },
        media: extracted.logoUrl ? [{ url: extracted.logoUrl }] : [],
        tags: [brandName || fallbackTitle].filter(Boolean),
    };
};
const resolveSiteTarget = async (input) => {
    if (input.siteId) {
        return db_1.prisma.site.findUnique({ where: { id: input.siteId } });
    }
    if (input.siteCode) {
        return db_1.prisma.site.findUnique({ where: { code: input.siteCode } });
    }
    if (input.siteName) {
        const matches = await db_1.prisma.site.findMany({
            where: { name: { equals: input.siteName, mode: "insensitive" } },
            take: 2,
        });
        if (matches.length > 1) {
            throw new api_error_1.ApiError(400, `Multiple sites matched siteName "${input.siteName}". Use siteId or siteCode.`);
        }
        return matches[0] || null;
    }
    return null;
};
const resolveTargets = async ({ apiKey, targets, }) => {
    const resolved = [];
    for (const target of targets) {
        const site = await resolveSiteTarget(target);
        if (!site || !site.isActive) {
            throw new api_error_1.ApiError(404, `Site not found or inactive for target "${target.siteId || target.siteCode || target.siteName}".`);
        }
        const allowed = await (0, auth_1.ensureSiteAccess)(apiKey.id, site.id, "post");
        if (!allowed && !apiKey.scopes.includes("*")) {
            throw new api_error_1.ApiError(403, `API key is not allowed to post on site "${site.name}".`);
        }
        const taskKey = (0, ai_posting_utils_1.inferTaskForSite)(site);
        if (!taskKey) {
            throw new api_error_1.ApiError(400, `Could not infer task for site "${site.name}".`);
        }
        await (0, user_access_service_1.enforceUserPostPolicy)({
            apiKey,
            siteId: site.id,
            taskKey,
            action: "post",
        });
        resolved.push({
            siteId: site.id,
            siteCode: site.code,
            siteName: site.name,
            taskKey,
        });
    }
    return resolved;
};
const createAiPostingJob = async ({ apiKey, payload, requestMeta, }) => {
    const validated = (0, ai_posting_utils_1.validateAiPostingPayload)(payload);
    if (!validated.ok) {
        throw new api_error_1.ApiError(400, validated.message);
    }
    const settings = await (0, ai_posting_settings_service_1.getResolvedAiPostingSettings)();
    if (!settings?.isEnabled) {
        throw new api_error_1.ApiError(400, "AI posting is disabled.");
    }
    if (!settings.apiKey) {
        throw new api_error_1.ApiError(400, "AI posting OpenAI key is not configured.");
    }
    const resolvedTargets = await resolveTargets({ apiKey, targets: validated.value.targets });
    const job = await db_1.prisma.aiPostingJob.create({
        data: {
            apiKeyId: apiKey.id,
            userId: apiKey.userId || null,
            targetUrl: validated.value.targetUrl,
            brandName: validated.value.brandName,
            model: settings.model,
            language: "en",
            wordCount: settings.defaultWordCount || ai_posting_utils_1.AI_POSTING_DEFAULT_WORD_COUNT,
            metadata: {
                requestMeta: requestMeta || {},
                source: settings.source,
                retryOn404: settings.retryOn404,
                requestTimeoutMs: settings.requestTimeoutMs,
            },
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
        void (0, user_access_service_1.logApiActivity)({
            apiKeyId: apiKey.id,
            userId: apiKey.userId,
            action: "ai-posting:create",
            status: client_1.ApiActivityStatus.SUCCESS,
            method: requestMeta?.method || "POST",
            path: requestMeta?.path || "/api/v1/ai-posting/jobs",
            ipAddress: requestMeta?.ipAddress || null,
            meta: {
                targetUrl: validated.value.targetUrl,
                targetCount: resolvedTargets.length,
            },
        }).catch(() => undefined);
    }
    queueMicrotask(() => {
        (0, exports.processAiPostingJob)(job.id).catch((error) => {
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
exports.createAiPostingJob = createAiPostingJob;
const getAiPostingJobStatus = async ({ jobId, apiKey, }) => {
    const job = await db_1.prisma.aiPostingJob.findUnique({
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
        throw new api_error_1.ApiError(404, "AI posting job not found.");
    }
    if (job.apiKeyId !== apiKey.id && !apiKey.scopes.includes("*")) {
        throw new api_error_1.ApiError(403, "You do not have access to this AI posting job.");
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
            message: run.errorMessage || (run.status === client_1.AiPostingRunStatus.COMPLETED ? "Post published successfully." : null),
        })),
    };
};
exports.getAiPostingJobStatus = getAiPostingJobStatus;
const listAiPostingJobs = async ({ apiKey, page = 1, limit = 20, status, search, }) => {
    const safePage = Math.max(1, Number(page || 1));
    const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
    const where = {};
    if (!apiKey.scopes.includes("*")) {
        where.apiKeyId = apiKey.id;
    }
    if (status && Object.values(client_1.AiPostingJobStatus).includes(status)) {
        where.status = status;
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
        db_1.prisma.aiPostingJob.count({ where }),
        db_1.prisma.aiPostingJob.findMany({
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
exports.listAiPostingJobs = listAiPostingJobs;
const processAiPostingJob = async (jobId) => {
    const job = await db_1.prisma.aiPostingJob.findUnique({
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
    const settings = await (0, ai_posting_settings_service_1.getResolvedAiPostingSettings)();
    if (!settings?.apiKey) {
        await db_1.prisma.aiPostingJob.update({
            where: { id: jobId },
            data: {
                status: client_1.AiPostingJobStatus.FAILED,
                errorMessage: "OPENAI_API_KEY is not configured.",
                finishedAt: new Date(),
            },
        });
        await db_1.prisma.aiPostingRun.updateMany({
            where: { jobId },
            data: {
                status: client_1.AiPostingRunStatus.FAILED,
                errorMessage: "OPENAI_API_KEY is not configured.",
                finishedAt: new Date(),
            },
        });
        return;
    }
    await db_1.prisma.aiPostingJob.update({
        where: { id: jobId },
        data: {
            status: client_1.AiPostingJobStatus.PROCESSING,
            startedAt: new Date(),
        },
    });
    const crawl = await crawlTargetUrl({
        targetUrl: job.targetUrl,
        retryOn404: settings.retryOn404,
        timeoutMs: settings.requestTimeoutMs,
    });
    if (!crawl.ok || !crawl.html) {
        await db_1.prisma.aiPostingJob.update({
            where: { id: jobId },
            data: {
                status: client_1.AiPostingJobStatus.FAILED,
                finalUrl: crawl.finalUrl || job.targetUrl,
                crawlAttempts: crawl.attempts,
                httpStatus: crawl.httpStatus || null,
                errorMessage: crawl.errorMessage || "Given URL not reached.",
                finishedAt: new Date(),
            },
        });
        await db_1.prisma.aiPostingRun.updateMany({
            where: { jobId },
            data: {
                status: client_1.AiPostingRunStatus.FAILED,
                errorMessage: crawl.errorMessage || "Given URL not reached.",
                finishedAt: new Date(),
            },
        });
        return;
    }
    const extracted = (0, ai_posting_utils_1.extractPageData)(crawl.html);
    const fallbackUsed = !extracted.hasEnoughContent;
    await db_1.prisma.aiPostingJob.update({
        where: { id: jobId },
        data: {
            finalUrl: crawl.finalUrl || job.targetUrl,
            crawlAttempts: crawl.attempts,
            httpStatus: crawl.httpStatus || null,
            extractedData: extracted,
            fallbackUsed,
        },
    });
    for (const run of job.runs) {
        await db_1.prisma.aiPostingRun.update({
            where: { id: run.id },
            data: {
                status: client_1.AiPostingRunStatus.PROCESSING,
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
            const created = await (0, post_service_1.createPublishedPost)({
                apiKey: {
                    id: job.apiKey.id,
                    scopes: job.apiKey.scopes,
                    userId: job.apiKey.userId,
                },
                siteCode: run.site.code,
                title: generated.title,
                summary: generated.summary,
                content: generated.content,
                media: generated.media,
                tags: generated.tags,
                authorName: job.brandName || run.site.name,
                requestedTask: run.taskKey,
            });
            await db_1.prisma.aiPostingRun.update({
                where: { id: run.id },
                data: {
                    status: client_1.AiPostingRunStatus.COMPLETED,
                    postId: created.post.id,
                    liveUrl: created.liveUrl,
                    generatedPost: generated,
                    finishedAt: new Date(),
                },
            });
        }
        catch (error) {
            await db_1.prisma.aiPostingRun.update({
                where: { id: run.id },
                data: {
                    status: client_1.AiPostingRunStatus.FAILED,
                    errorMessage: error instanceof Error ? error.message : "Run failed",
                    finishedAt: new Date(),
                },
            });
        }
    }
    const refreshedRuns = await db_1.prisma.aiPostingRun.findMany({
        where: { jobId },
        select: { status: true },
    });
    await db_1.prisma.aiPostingJob.update({
        where: { id: jobId },
        data: {
            status: mapJobStatusFromRuns(refreshedRuns),
            finishedAt: new Date(),
            errorMessage: refreshedRuns.every((run) => run.status === client_1.AiPostingRunStatus.FAILED)
                ? "All target runs failed."
                : null,
        },
    });
};
exports.processAiPostingJob = processAiPostingJob;
