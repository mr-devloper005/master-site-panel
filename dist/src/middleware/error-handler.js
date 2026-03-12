"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFoundHandler = void 0;
const api_error_1 = require("../utils/api-error");
const notFoundHandler = (_req, res) => {
    res.status(404).json({ success: false, message: "Route not found." });
};
exports.notFoundHandler = notFoundHandler;
const errorHandler = (err, _req, res, _next) => {
    if (err instanceof api_error_1.ApiError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
    }
    res.status(500).json({
        success: false,
        message: "Internal server error.",
        debug: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
};
exports.errorHandler = errorHandler;
