import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import type { Server } from "node:http";

import { createAiPostingRouter } from "./ai-posting.routes";

const buildTestServer = (deps?: Parameters<typeof createAiPostingRouter>[0]) => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/ai-posting", createAiPostingRouter(deps));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ success: false, message: error.message });
  });
  return new Promise<{ server: Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Could not bind test server.");
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
};

const authStub: RequestHandler = (req, _res, next) => {
  req.apiKey = {
    id: "key_1",
    keyHash: "hash",
    scopes: ["posts:write", "posts:read"],
    userId: "user_1",
    name: "Test Key",
    rawTokenCipher: null,
    isActive: true,
    lastUsedAt: null,
    lastUsedIp: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  next();
};

test("POST /jobs returns queued batch response", async () => {
  const { server, baseUrl } = await buildTestServer({
    requireWrite: authStub,
    requireRead: authStub,
    createJob: async () => ({
      jobId: "job_123",
      status: "QUEUED" as const,
      targetUrl: "https://example.com/service",
      totalTargets: 2,
      runs: [
        { taskId: "run_1", siteId: "site_1", taskKey: "article", status: "PENDING" as const },
        { taskId: "run_2", siteId: "site_2", taskKey: "listing", status: "PENDING" as const },
      ],
    }),
    listJobs: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
    getStatus: async () => { throw new Error("not used"); },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/ai-posting/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: "https://example.com/service",
        brandName: "Example Brand",
        targets: [{ siteId: "site_1" }, { siteId: "site_2" }],
      }),
    });
    const json = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 202);
    assert.equal(json.success, true);
    assert.equal(json.jobId, "job_123");
  } finally {
    server.close();
  }
});

test("GET /jobs/:jobId returns progress and live links", async () => {
  const { server, baseUrl } = await buildTestServer({
    requireWrite: authStub,
    requireRead: authStub,
    createJob: async () => { throw new Error("not used"); },
    listJobs: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
    getStatus: async () => ({
      success: true,
      jobId: "job_123",
      status: "PARTIAL" as const,
      targetUrl: "https://example.com/service",
      finalUrl: "https://example.com/service",
      message: null,
      summary: { total: 2, completed: 1, pending: 0, failed: 1, processing: 0 },
      runs: [
        { taskId: "run_1", siteId: "site_1", siteCode: "aidteck", siteName: "Aidteck", taskKey: "article", status: "COMPLETED", liveUrl: "https://aidteck.com/article/x", message: "Post published successfully." },
        { taskId: "run_2", siteId: "site_2", siteCode: "veluzatom", siteName: "Veluzatom", taskKey: "article", status: "FAILED", liveUrl: null, message: "Given URL returned 404 and could not be reached after retry." },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/ai-posting/jobs/job_123`);
    const json = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.status, "PARTIAL");
  } finally {
    server.close();
  }
});
