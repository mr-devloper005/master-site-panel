import { Router, type RequestHandler } from "express";

import { requireApiKey } from "../../middleware/auth";
import { asyncHandler } from "../../utils/async-handler";
import { createAiPostingJob, getAiPostingJobStatus, listAiPostingJobs } from "./ai-posting.service";

type AiPostingRouteDeps = {
  requireWrite: RequestHandler;
  requireRead: RequestHandler;
  createJob: typeof createAiPostingJob;
  getStatus: typeof getAiPostingJobStatus;
  listJobs: typeof listAiPostingJobs;
};

const defaultDeps: AiPostingRouteDeps = {
  requireWrite: requireApiKey("posts:write"),
  requireRead: requireApiKey("posts:read"),
  createJob: createAiPostingJob,
  getStatus: getAiPostingJobStatus,
  listJobs: listAiPostingJobs,
};

export const createAiPostingRouter = (deps: AiPostingRouteDeps = defaultDeps) => {
  const router = Router();

  router.post(
    "/jobs",
    deps.requireWrite,
    asyncHandler(async (req, res) => {
      const apiKey = req.apiKey;
      const result = await deps.createJob({
        apiKey: {
          id: apiKey!.id,
          scopes: apiKey!.scopes,
          userId: apiKey!.userId,
          name: apiKey!.name,
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
    })
  );

  router.get(
    "/jobs",
    deps.requireRead,
    asyncHandler(async (req, res) => {
      const apiKey = req.apiKey;
      const result = await deps.listJobs({
        apiKey: {
          id: apiKey!.id,
          scopes: apiKey!.scopes,
          userId: apiKey!.userId,
          name: apiKey!.name,
        },
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
        status: typeof req.query.status === "string" ? req.query.status : "",
        search: typeof req.query.search === "string" ? req.query.search : "",
      });
      res.json({ success: true, ...result });
    })
  );

  router.get(
    "/jobs/:jobId",
    deps.requireRead,
    asyncHandler(async (req, res) => {
      const apiKey = req.apiKey;
      const result = await deps.getStatus({
        jobId: String(req.params.jobId || "").trim(),
        apiKey: {
          id: apiKey!.id,
          scopes: apiKey!.scopes,
          userId: apiKey!.userId,
          name: apiKey!.name,
        },
      });
      res.json(result);
    })
  );

  return router;
};

export default createAiPostingRouter();
