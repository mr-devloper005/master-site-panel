"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const api_error_1 = require("../../utils/api-error");
const async_handler_1 = require("../../utils/async-handler");
const contact_service_1 = require("./contact-service");
const router = (0, express_1.Router)();
const parsePositiveInt = (value, fallback, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return Math.min(Math.floor(parsed), max);
};
router.get("/", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const siteCode = typeof req.query.siteCode === "string" ? req.query.siteCode.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = (0, contact_service_1.normalizeContactStatus)(req.query.status);
    const where = {
        ...(status ? { status } : {}),
        ...(siteCode ? { site: { code: siteCode } } : {}),
        ...(search
            ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { subject: { contains: search, mode: "insensitive" } },
                    { message: { contains: search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, total] = await Promise.all([
        db_1.prisma.contactSubmission.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                site: { select: { id: true, code: true, name: true } },
                queuedEmails: {
                    orderBy: { createdAt: "asc" },
                },
            },
        }),
        db_1.prisma.contactSubmission.count({ where }),
    ]);
    res.json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
        },
    });
}));
router.get("/:submissionId", (0, auth_1.requireApiKey)("sites:read"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const submission = await db_1.prisma.contactSubmission.findUnique({
        where: { id: String(req.params.submissionId) },
        include: {
            site: { select: { id: true, code: true, name: true } },
            queuedEmails: {
                orderBy: { createdAt: "asc" },
            },
        },
    });
    if (!submission)
        throw new api_error_1.ApiError(404, "Contact submission not found.");
    res.json({ success: true, data: submission });
}));
router.patch("/:submissionId", (0, auth_1.requireApiKey)("sites:write"), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const status = (0, contact_service_1.normalizeContactStatus)(req.body?.status);
    if (!status)
        throw new api_error_1.ApiError(400, "Valid status is required.");
    const submission = await db_1.prisma.contactSubmission.update({
        where: { id: String(req.params.submissionId) },
        data: { status },
        include: {
            site: { select: { id: true, code: true, name: true } },
            queuedEmails: {
                orderBy: { createdAt: "asc" },
            },
        },
    });
    res.json({ success: true, data: submission });
}));
exports.default = router;
