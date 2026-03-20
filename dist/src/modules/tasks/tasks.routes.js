"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteTaskRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const post_service_1 = require("../posts/post-service");
const site_contract_1 = require("../sites/site-contract");
const router = (0, express_1.Router)();
exports.siteTaskRouter = (0, express_1.Router)();
const handleTaskPost = async ({ task, siteCode, req, res, }) => {
    if (!(0, site_contract_1.isSiteTask)(task)) {
        throw new api_error_1.ApiError(400, "Invalid task value.");
    }
    const apiKey = req.apiKey;
    if (!apiKey) {
        throw new api_error_1.ApiError(401, "API key context missing.");
    }
    const { siteCode: bodySiteCode, title, slug, summary, content, media, tags, authorName, externalPostId } = req.body;
    const resolvedSiteCode = siteCode || bodySiteCode;
    const created = await (0, post_service_1.createPublishedPost)({
        apiKey,
        siteCode: resolvedSiteCode,
        title,
        slug,
        summary,
        content,
        media,
        tags,
        authorName,
        externalPostId,
        requestedTask: task,
    });
    res.status(201).json({
        success: true,
        data: {
            ...created.post,
            liveUrl: created.liveUrl,
            task,
        },
    });
};
router.post("/:task/posts", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const task = String(req.params.task || "").trim().toLowerCase();
    await handleTaskPost({ task, req, res });
}));
exports.siteTaskRouter.post("/:siteCode/post/v1/:task", (0, auth_1.requireApiKey)("posts:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const task = String(req.params.task || "").trim().toLowerCase();
    const siteCode = String(req.params.siteCode || "").trim();
    await handleTaskPost({ task, siteCode, req, res });
}));
exports.default = router;
