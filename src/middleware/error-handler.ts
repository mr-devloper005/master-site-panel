import { Request, Response, NextFunction } from "express";

import { ApiError } from "../utils/api-error";

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: "Route not found." });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Internal server error.",
    debug: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
