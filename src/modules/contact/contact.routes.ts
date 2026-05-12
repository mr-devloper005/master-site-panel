import { Prisma } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../config/db";
import { requireApiKey } from "../../middleware/auth";
import { ApiError } from "../../utils/api-error";
import { asyncHandler } from "../../utils/async-handler";
import { normalizeContactStatus } from "./contact-service";

const router = Router();

const parsePositiveInt = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
};

router.get(
  "/",
  requireApiKey("sites:read"),
  asyncHandler(async (req, res) => {
    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const siteCode = typeof req.query.siteCode === "string" ? req.query.siteCode.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = normalizeContactStatus(req.query.status);

    const where: Prisma.ContactSubmissionWhereInput = {
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
      prisma.contactSubmission.findMany({
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
      prisma.contactSubmission.count({ where }),
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
  })
);

router.get(
  "/:submissionId",
  requireApiKey("sites:read"),
  asyncHandler(async (req, res) => {
    const submission = await prisma.contactSubmission.findUnique({
      where: { id: String(req.params.submissionId) },
      include: {
        site: { select: { id: true, code: true, name: true } },
        queuedEmails: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!submission) throw new ApiError(404, "Contact submission not found.");
    res.json({ success: true, data: submission });
  })
);

router.patch(
  "/:submissionId",
  requireApiKey("sites:write"),
  asyncHandler(async (req, res) => {
    const status = normalizeContactStatus(req.body?.status);
    if (!status) throw new ApiError(400, "Valid status is required.");

    const submission = await prisma.contactSubmission.update({
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
  })
);

export default router;
