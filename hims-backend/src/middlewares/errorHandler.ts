import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { isAppError } from "../utils/errors.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` });
}

interface MongoServerErrorLike {
  code?: number;
}

function isDuplicateKeyError(err: unknown): err is MongoServerErrorLike {
  return typeof err === "object" && err !== null && "code" in err && (err as MongoServerErrorLike).code === 11000;
}

/**
 * Central Express error handler — every controller in this codebase
 * calls `next(err)` on failure rather than shaping its own error
 * response, so this is the single place HTTP status/body mapping lives.
 * Must be registered last, after all routes.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: `Invalid value for "${err.path}": ${String(err.value)}` });
    return;
  }

  if (isDuplicateKeyError(err)) {
    res.status(409).json({ error: "DUPLICATE_KEY", message: "A record with the same unique value already exists" });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" });
}
