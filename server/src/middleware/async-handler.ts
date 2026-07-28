import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 4 does not forward rejected promises from async route handlers.
 * Keeping the forwarding in one place prevents a database error from becoming
 * an unhandled rejection and taking down the whole web process.
 */
export const asyncHandler = (handler: AsyncRequestHandler): RequestHandler => (req, res, next) => {
  void Promise.resolve(handler(req, res, next)).catch(next);
};
