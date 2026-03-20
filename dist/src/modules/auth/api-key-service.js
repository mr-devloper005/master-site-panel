"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiKeyWithPermissions = exports.resolveScopesForPreset = exports.inferTask = exports.EXTRA_SCOPE_PRESETS = exports.TASK_SCOPE_PRESETS = exports.SITE_MASTER_SCOPE = exports.getTaskScope = exports.hashApiKey = exports.createRawApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../../config/db");
const site_contract_1 = require("../sites/site-contract");
const createRawApiKey = () => crypto_1.default.randomBytes(24).toString("hex");
exports.createRawApiKey = createRawApiKey;
const hashApiKey = (value) => crypto_1.default.createHash("sha256").update(value).digest("hex");
exports.hashApiKey = hashApiKey;
const getTaskScope = (task) => `task:${task}`;
exports.getTaskScope = getTaskScope;
exports.SITE_MASTER_SCOPE = "site:master";
const baseSiteScopes = ["posts:write", "posts:read", "sites:read"];
exports.TASK_SCOPE_PRESETS = Object.fromEntries(site_contract_1.SITE_TASKS.map((task) => [task, [...baseSiteScopes, (0, exports.getTaskScope)(task)]]));
exports.EXTRA_SCOPE_PRESETS = {
    runtime: ["sites:read"],
    siteMaster: [...baseSiteScopes, exports.SITE_MASTER_SCOPE],
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
const createApiKeyWithPermissions = async ({ name, scopes, task, siteIds, canPost = true, canRead = true, }) => {
    const resolvedScopes = (0, exports.resolveScopesForPreset)(task, scopes);
    const raw = (0, exports.createRawApiKey)();
    const keyHash = (0, exports.hashApiKey)(raw);
    const key = await db_1.prisma.apiKey.create({
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
