import { Router, type Request, type Response } from "express";

import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { createPublishedPost } from "../posts/post-service";
import { isSiteTask } from "../sites/site-contract";

const router = Router();
export const siteTaskRouter = Router();

const normalizeTaskValue = (value?: string | string[] | null): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "blog-commenting" || normalized === "blog_commenting") {
    return "comment";
  }
  if (
    normalized === "mediadistribution" ||
    normalized === "media-distribution" ||
    normalized === "media_distribution"
  ) {
    return "mediaDistribution";
  }
  return normalized;
};

const handleTaskPost = async ({
  task,
  siteCode,
  req,
  res,
}: {
  task: string;
  siteCode?: string;
  req: Request;
  res: Response;
}) => {
  if (!isSiteTask(task)) {
    throw new ApiError(400, "Invalid task value.");
  }

  const apiKey = req.apiKey;
  if (!apiKey) {
    throw new ApiError(401, "API key context missing.");
  }

  const {
    siteCode: bodySiteCode,
    title,
    slug,
    summary,
    metaTitle,
    metaDescription,
    content,
    media,
    tags,
    authorName,
    externalPostId,
  } = req.body;
  const resolvedSiteCode = siteCode || bodySiteCode;

  const created = await createPublishedPost({
    apiKey,
    siteCode: resolvedSiteCode,
    title,
    slug,
    summary,
    metaTitle,
    metaDescription,
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

router.post("/:task/posts", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const task = normalizeTaskValue(req.params.task);
  await handleTaskPost({ task, req, res });
}));

siteTaskRouter.post("/:siteCode/post/v1/:task", requireApiKey("posts:write"), asyncHandler(async (req, res) => {
  const task = normalizeTaskValue(req.params.task);
  const siteCode = String(req.params.siteCode || "").trim();
  await handleTaskPost({ task, siteCode, req, res });
}));

export default router;
