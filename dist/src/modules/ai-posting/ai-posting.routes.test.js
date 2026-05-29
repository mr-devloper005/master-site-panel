"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const express_1 = __importDefault(require("express"));
const ai_posting_routes_1 = require("./ai-posting.routes");
const buildTestServer = (deps) => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/ai-posting", (0, ai_posting_routes_1.createAiPostingRouter)(deps));
    app.use((error, _req, res, _next) => {
        res.status(400).json({ success: false, message: error.message });
    });
    return new Promise((resolve) => {
        const server = app.listen(0, () => {
            const address = server.address();
            if (!address || typeof address === "string")
                throw new Error("Could not bind test server.");
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
};
const authStub = (req, _res, next) => {
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
(0, node_test_1.default)("POST /jobs returns queued batch response", async () => {
    const { server, baseUrl } = await buildTestServer({
        requireWrite: authStub,
        requireRead: authStub,
        createJob: async () => ({
            jobId: "job_123",
            status: "QUEUED",
            targetUrl: "https://example.com/service",
            totalTargets: 2,
            runs: [
                { taskId: "run_1", siteId: "site_1", taskKey: "article", status: "PENDING" },
                { taskId: "run_2", siteId: "site_2", taskKey: "listing", status: "PENDING" },
            ],
        }),
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
        const json = await response.json();
        strict_1.default.equal(response.status, 202);
        strict_1.default.equal(json.success, true);
        strict_1.default.equal(json.jobId, "job_123");
    }
    finally {
        server.close();
    }
});
(0, node_test_1.default)("GET /jobs/:jobId returns progress and live links", async () => {
    const { server, baseUrl } = await buildTestServer({
        requireWrite: authStub,
        requireRead: authStub,
        createJob: async () => { throw new Error("not used"); },
        getStatus: async () => ({
            success: true,
            jobId: "job_123",
            status: "PARTIAL",
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
        const json = await response.json();
        strict_1.default.equal(response.status, 200);
        strict_1.default.equal(json.success, true);
        strict_1.default.equal(json.status, "PARTIAL");
    }
    finally {
        server.close();
    }
});
