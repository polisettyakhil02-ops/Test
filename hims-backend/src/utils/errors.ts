/**
 * Typed application errors. Every domain service throws one of these
 * (never a bare `Error`) so the future controller-layer error handler
 * (Step 3) can map `statusCode`/`code` straight onto the HTTP response
 * without string-sniffing messages.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(message, 401, "AUTHENTICATION_REQUIRED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/** Raised when a bed/room is already occupied/reserved at claim time — the ADT double-booking guard. */
export class ResourceUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 409, "RESOURCE_UNAVAILABLE");
  }
}

/** Raised when total on-hand stock across eligible batches cannot cover a requested dispensation quantity. */
export class InsufficientStockError extends AppError {
  constructor(message: string) {
    super(message, 409, "INSUFFICIENT_STOCK");
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
