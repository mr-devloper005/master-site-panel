"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAiPostingRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const async_handler_1 = require("../../utils/async-handler");
const ai_posting_service_1 = require("./ai-posting.service");
const defaultDeps = {
    requireWrite: (0, auth_1.requireApiKey)("posts:write"),
    requireRead: (0, auth_1.requireApiKey)("posts:read"),
    createJob: ai_posting_service_1.createAiPostingJob,
    getStatus: ai_posting_service_1.getAiPostingJobStatus,
};
const createAiPostingRouter = (deps = defaultDeps) => {
    const router = (0, express_1.Router)();
    router.post("/jobs", deps.requireWrite, (0, async_handler_1.asyncHandler)(async (req, res) => {
        const apiKey = req.apiKey;
        const result = await deps.createJob({
            apiKey: {
                id: apiKey.id,
                scopes: apiKey.scopes,
                userId: apiKey.userId,
                name: apiKey.name,
            },
            payload: req.body || {},
            requestMeta: {
                ipAddress: req.ip,
                method: req.method,
                path: req.path,
            },
        });
        res.status(202).json({
            success: true,
            jobId: result.jobId,
            status: result.status,
            targetUrl: result.targetUrl,
            totalTargets: result.totalTargets,
            runs: result.runs,
            message: "AI posting job created successfully.",
        });
    }));
    router.get("/jobs/:jobId", deps.requireRead, (0, async_handler_1.asyncHandler)(async (req, res) => {
        const apiKey = req.apiKey;
        const result = await deps.getStatus({
            jobId: String(req.params.jobId || "").trim(),
            apiKey: {
                id: apiKey.id,
                scopes: apiKey.scopes,
                userId: apiKey.userId,
                name: apiKey.name,
            },
        });
        res.json(result);
    }));
    return router;
};
exports.createAiPostingRouter = createAiPostingRouter;
exports.default = (0, exports.createAiPostingRouter)();
