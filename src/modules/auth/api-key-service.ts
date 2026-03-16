import crypto from "crypto";

import { prisma } from "../../config/db";
import { SITE_TASKS, type SiteTask, isSiteTask } from "../sites/site-contract";

export const createRawApiKey = (): string => crypto.randomBytes(24).toString("hex");
export const hashApiKey = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const getTaskScope = (task: SiteTask): string => `task:${task}`;
export const SITE_MASTER_SCOPE = "site:master";

const baseSiteScopes = ["posts:write", "posts:read", "sites:read"];

export const TASK_SCOPE_PRESETS: Record<SiteTask, string[]> = Object.fromEntries(
  SITE_TASKS.map((task) => [task, [...baseSiteScopes, getTaskScope(task)]])
) as Record<SiteTask, string[]>;

export const EXTRA_SCOPE_PRESETS = {
  runtime: ["sites:read"],
  siteMaster: [...baseSiteScopes, SITE_MASTER_SCOPE],
} as const;

export type KeyPreset = SiteTask | keyof typeof EXTRA_SCOPE_PRESETS;

export const inferTask = (scopes: string[]): KeyPreset | "custom" => {
  const matched = SITE_TASKS.find((task) => scopes.includes(getTaskScope(task)));
  if (matched) return matched;
  if (scopes.includes(SITE_MASTER_SCOPE)) return "siteMaster";
  if (EXTRA_SCOPE_PRESETS.runtime.every((scope) => scopes.includes(scope))) {
    return "runtime";
  }
  return "custom";
};

type CreateApiKeyOptions = {
  name: string;
  scopes?: string[];
  task?: KeyPreset | null;
  siteIds?: string[];
  canPost?: boolean;
  canRead?: boolean;
};

export const resolveScopesForPreset = (task?: KeyPreset | null, scopes?: string[]): string[] => {
  if (Array.isArray(scopes) && scopes.length > 0) return scopes;
  if (!task) return [];
  if (task in EXTRA_SCOPE_PRESETS) {
    return [...EXTRA_SCOPE_PRESETS[task as keyof typeof EXTRA_SCOPE_PRESETS]];
  }
  if (isSiteTask(task)) {
    return [...TASK_SCOPE_PRESETS[task]];
  }
  return [];
};

export const createApiKeyWithPermissions = async ({
  name,
  scopes,
  task,
  siteIds,
  canPost = true,
  canRead = true,
}: CreateApiKeyOptions) => {
  const resolvedScopes = resolveScopesForPreset(task, scopes);
  const raw = createRawApiKey();
  const keyHash = hashApiKey(raw);

  const key = await prisma.apiKey.create({
    data: {
      name,
      scopes: resolvedScopes,
      keyHash,
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (Array.isArray(siteIds) && siteIds.length > 0) {
    await prisma.apiKeySitePermission.createMany({
      data: siteIds.map((siteId) => ({
        apiKeyId: key.id,
        siteId,
        canPost: Boolean(canPost),
        canRead: Boolean(canRead),
      })),
      skipDuplicates: true,
    });
  }

  return {
    ...key,
    task: task || inferTask(resolvedScopes),
    siteIds: Array.isArray(siteIds) ? siteIds : [],
    rawApiKey: raw,
  };
};
