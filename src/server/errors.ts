/** Domain errors carry an HTTP status so route handlers stay thin. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'BAD_REQUEST',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class InventoryConflictError extends AppError {
  constructor(message = 'Those dates were just taken. Please pick another room or date.') {
    super(message, 409, 'INVENTORY_CONFLICT');
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Resource') {
    super(`${what} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You must be signed in to do that.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      body: { error: error.message, code: error.code, details: error.details },
      status: error.status,
    };
  }
  console.error('Unhandled error', error);
  return {
    body: { error: 'Something went wrong on our side.', code: 'INTERNAL_ERROR' },
    status: 500,
  };
}
