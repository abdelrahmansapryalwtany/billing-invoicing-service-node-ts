import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "./httpError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      errorCode: "VALIDATION_ERROR",
      message: "Invalid request",
      details: { issues: err.issues }
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      errorCode: err.errorCode,
      message: err.message,
      details: err.details ?? {}
    });
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  return res.status(500).json({
    errorCode: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
    details: {}
  });
}

