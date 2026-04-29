"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiKeyWithPermissions = exports.deactivateSiteTaskKeys = exports.resolveScopesForPreset = exports.inferTask = exports.EXTRA_SCOPE_PRESETS = exports.TASK_SCOPE_PRESETS = exports.SITE_MASTER_SCOPE = exports.getTaskScope = exports.decryptApiKeyToken = exports.encryptApiKeyToken = exports.hashApiKey = exports.createRawApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../../config/db");
const site_contract_1 = require("../sites/site-contract");
const createRawApiKey = () => crypto_1.default.randomBytes(24).toString("hex");
exports.createRawApiKey = createRawApiKey;
const hashApiKey = (value) => crypto_1.default.createHash("sha256").update(value).digest("hex");
exports.hashApiKey = hashApiKey;
const TOKEN_CIPHER_ALGORITHM = "aes-256-gcm";
const getTokenCipherSecret = () => {
    const secret = process.env.API_KEY_TOKEN_EXPORT_SECRET ||
        process.env.REVALIDATE_SECRET ||
        process.env.NEXT_REVALIDATE_SECRET ||
        "master-site-panel-local-export-secret";
    return crypto_1.default.createHash("sha256").update(secret).digest();
};
const encryptApiKeyToken = (value) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(TOKEN_CIPHER_ALGORITHM, getTokenCipherSecret(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
};
exports.encryptApiKeyToken = encryptApiKeyToken;
const decryptApiKeyToken = (value) => {
    if (!value)
        return null;
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    if (!ivHex || !tagHex || !encryptedHex)
        return null;
    try {
        const decipher = crypto_1.default.createDecipheriv(TOKEN_CIPHER_ALGORITHM, getTokenCipherSecret(), Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedHex, "hex")),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    }
    catch {
        return null;
    }
};
exports.decryptApiKeyToken = decryptApiKeyToken;
const getTaskScope = (task) => `task:${task}`;
exports.getTaskScope = getTaskScope;
exports.SITE_MASTER_SCOPE = "site:master";
const baseSiteScopes = ["posts:write", "posts:read", "sites:read"];
exports.TASK_SCOPE_PRESETS = Object.fromEntries(site_contract_1.SITE_TASKS.map((task) => [task, [...baseSiteScopes, (0, exports.getTaskScope)(task)]]));
exports.EXTRA_SCOPE_PRESETS = {
    runtime: ["sites:read"],
    siteMaster: [...baseSiteScopes, "sites:write", "keys:write", exports.SITE_MASTER_SCOPE],
};
const inferTask = (scopes) => {
    const matched = site_contract_1.SITE_TASKS.find((task) => scopes.includes((0, exports.getTaskScope)(task)));
    if (matched)
        return matched;
    if (scopes.includes(exports.SITE_MASTER_SCOPE))
        return "siteMaster";
    if (exports.EXTRA_SCOPE_PRESETS.runtime.every((scope) => scopes.includes(scope))) {
        return "runtime";
    }
    return "custom";
};
exports.inferTask = inferTask;
const resolveScopesForPreset = (task, scopes) => {
    if (Array.isArray(scopes) && scopes.length > 0)
        return scopes;
    if (!task)
        return [];
    if (task in exports.EXTRA_SCOPE_PRESETS) {
        return [...exports.EXTRA_SCOPE_PRESETS[task]];
    }
    if ((0, site_contract_1.isSiteTask)(task)) {
        return [...exports.TASK_SCOPE_PRESETS[task]];
    }
    return [];
};
exports.resolveScopesForPreset = resolveScopesForPreset;
const deactivateSiteTaskKeys = async (siteId, task) => {
    const taskScope = (0, exports.getTaskScope)(task);
    const existingKeys = await db_1.prisma.apiKey.findMany({
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
    if (existingKeys.length === 0)
        return 0;
    await db_1.prisma.apiKey.updateMany({
        where: {
            id: { in: existingKeys.map((key) => key.id) },
        },
        data: { isActive: false },
    });
    return existingKeys.length;
};
exports.deactivateSiteTaskKeys = deactivateSiteTaskKeys;
const createApiKeyWithPermissions = async ({ name, scopes, task, siteIds, canPost = true, canRead = true, }) => {
    const resolvedScopes = (0, exports.resolveScopesForPreset)(task, scopes);
    const raw = (0, exports.createRawApiKey)();
    const keyHash = (0, exports.hashApiKey)(raw);
    const key = await db_1.prisma.apiKey.create({
        data: {
            name,
            scopes: resolvedScopes,
            keyHash,
            rawTokenCipher: (0, exports.encryptApiKeyToken)(raw),
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
        await db_1.prisma.apiKeySitePermission.createMany({
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
        task: task || (0, exports.inferTask)(resolvedScopes),
        siteIds: Array.isArray(siteIds) ? siteIds : [],
        rawApiKey: raw,
    };
};
exports.createApiKeyWithPermissions = createApiKeyWithPermissions;
