"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const posts_routes_1 = __importDefault(require("./modules/posts/posts.routes"));
const public_routes_1 = __importDefault(require("./modules/public/public.routes"));
const runtime_routes_1 = __importDefault(require("./modules/runtime/runtime.routes"));
const sites_routes_1 = __importDefault(require("./modules/sites/sites.routes"));
const error_handler_1 = require("./middleware/error-handler");
exports.app = (0, express_1.default)();
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json({ limit: "1mb" }));
exports.app.use((0, morgan_1.default)("dev"));
exports.app.get("/health", (_req, res) => {
    res.json({
        success: true,
        service: "multi-site-backend",
        timestamp: new Date().toISOString(),
    });
});
exports.app.use("/api/v1/auth", auth_routes_1.default);
exports.app.use("/api/v1/sites", sites_routes_1.default);
exports.app.use("/api/v1/posts", posts_routes_1.default);
exports.app.use("/api/v1/public", public_routes_1.default);
exports.app.use("/api/v1/runtime", runtime_routes_1.default);
exports.app.use(error_handler_1.notFoundHandler);
exports.app.use(error_handler_1.errorHandler);
