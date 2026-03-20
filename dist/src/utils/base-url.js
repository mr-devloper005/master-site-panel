"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseUrl = void 0;
const getBaseUrl = () => {
    const candidate = process.env.PUBLIC_BASE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        null;
    if (!candidate)
        return null;
    return candidate.replace(/\/+$/, "");
};
exports.getBaseUrl = getBaseUrl;
