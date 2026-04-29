import crypto from "crypto";

import { prisma } from "../../config/db";
import { SITE_TASKS, type SiteTask, isSiteTask } from "../sites/site-contract";

export const createRawApiKey = (): string => crypto.randomBytes(24).toString("hex");
export const hashApiKey = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const TOKEN_CIPHER_ALGORITHM = "aes-256-gcm";

const getTokenCipherSecret = (): Buffer => {
  const secret =
    process.env.API_KEY_TOKEN_EXPORT_SECRET ||
    process.env.REVALIDATE_SECRET ||
    process.env.NEXT_REVALIDATE_SECRET ||
    "master-site-panel-local-export-secret";

  return crypto.createHash("sha256").update(secret).digest();
};

export const encryptApiKeyToken = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(TOKEN_CIPHER_ALGORITHM, getTokenCipherSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};

export const decryptApiKeyToken = (value?: string | null): string | null => {
  if (!value) return null;

  const [ivHex, tagHex, encryptedHex] = value.split(":");
  if (!ivHex || !tagHex || !encryptedHex) return null;

  try {
    const decipher = crypto.createDecipheriv(
      TOKEN_CIPHER_ALGORITHM,
      getTokenCipherSecret(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
};

export const getTaskScope = (task: SiteTask): string => `task:${task}`;
export const SITE_MASTER_SCOPE = "site:master";

const baseSiteScopes = ["posts:write", "posts:read", "sites:read"];

export const TASK_SCOPE_PRESETS: Record<SiteTask, string[]> = Object.fromEntries(
  SITE_TASKS.map((task) => [task, [...baseSiteScopes, getTaskScope(task)]])
) as Record<SiteTask, string[]>;

export const EXTRA_SCOPE_PRESETS = {
  runtime: ["sites:read"],
  siteMaster: [...baseSiteScopes, "sites:write", "keys:write", SITE_MASTER_SCOPE],
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

export const deactivateSiteTaskKeys = async (siteId: string, task: SiteTask) => {
  const taskScope = getTaskScope(task);

  const existingKeys = await prisma.apiKey.findMany({
    where: {
      isActive: true,
      scopes: { has: taskScope },
      permissions: {
        some: {
          siteId,
        },
      },
    },
    select: { id: true },
  });

  if (existingKeys.length === 0) return 0;

  await prisma.apiKey.updateMany({
    where: {
      id: { in: existingKeys.map((key) => key.id) },
    },
    data: { isActive: false },
  });

  return existingKeys.length;
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
      rawTokenCipher: encryptApiKeyToken(raw),
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      isActive: true,
      createdAt: true,
      rawTokenCipher: true,
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
