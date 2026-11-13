/** Application error carrying an HTTP status and a stable, translatable code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, details?: unknown) => new AppError(400, code, code, details);
export const unauthorized = (code = 'unauthorized') => new AppError(401, code);
export const forbidden = (code = 'forbidden') => new AppError(403, code);
export const notFound = (code = 'not_found') => new AppError(404, code);
export const conflict = (code = 'conflict', details?: unknown) => new AppError(409, code, code, details);
export const locked = (code = 'account_locked') => new AppError(423, code);
