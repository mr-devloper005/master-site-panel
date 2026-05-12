"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const contact_email_queue_1 = require("./modules/contact/contact-email-queue");
const contact_routes_1 = __importDefault(require("./modules/contact/contact.routes"));
const posts_routes_1 = __importDefault(require("./modules/posts/posts.routes"));
const public_routes_1 = __importDefault(require("./modules/public/public.routes"));
const runtime_routes_1 = __importDefault(require("./modules/runtime/runtime.routes"));
const sites_routes_1 = __importDefault(require("./modules/sites/sites.routes"));
const indexing_scheduler_1 = require("./modules/sites/indexing-scheduler");
const tasks_routes_1 = __importStar(require("./modules/tasks/tasks.routes"));
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
exports.app.use("/api/v1/contact-submissions", contact_routes_1.default);
exports.app.use("/api/v1/posts", posts_routes_1.default);
exports.app.use("/api/v1/tasks", tasks_routes_1.default);
exports.app.use("/", tasks_routes_1.siteTaskRouter);
exports.app.use("/api/v1/public", public_routes_1.default);
exports.app.use("/api/v1/runtime", runtime_routes_1.default);
(0, indexing_scheduler_1.startIndexingScheduler)();
(0, contact_email_queue_1.startContactEmailQueueWorker)();
exports.app.use(error_handler_1.notFoundHandler);
exports.app.use(error_handler_1.errorHandler);
