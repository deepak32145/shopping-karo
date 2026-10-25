import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodIssue } from 'zod';

/** An error that maps to an HTTP response. Same JSON shape as the Java services (RFC 7807 + `code`). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors?: string[],
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message: string) => new HttpError(400, 'BAD_REQUEST', message);

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

function problem(status: number, code: string, detail: string, instance: string, errors?: string[]) {
  return { type: 'about:blank', title: TITLES[status] ?? 'Error', status, detail, instance, code, ...(errors ? { errors } : {}) };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).type('application/problem+json').json(problem(404, 'NOT_FOUND', 'No such endpoint', req.path));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).type('application/problem+json').json(problem(err.status, err.code, err.message, req.path, err.errors));
    return;
  }
  // Duck-typed: with pnpm the service and this package can load separate copies of zod, so instanceof is unreliable.
  if (isZodError(err)) {
    const errors = err.issues.map((i: ZodIssue) => `${i.path.join('.') || 'body'}: ${i.message}`);
    res.status(400).type('application/problem+json').json(problem(400, 'VALIDATION_FAILED', 'Validation failed', req.path, errors));
    return;
  }
  // body-parser: malformed JSON or payload too large
  if (typeof err === 'object' && err && 'status' in err && (err as { status: number }).status === 400) {
    res.status(400).type('application/problem+json').json(problem(400, 'BAD_REQUEST', 'Malformed request body', req.path));
    return;
  }
  if (typeof err === 'object' && err && 'status' in err && (err as { status: number }).status === 413) {
    res.status(413).type('application/problem+json').json(problem(413, 'PAYLOAD_TOO_LARGE', 'Request body too large', req.path));
    return;
  }
  console.error('Unhandled error', err);
  res.status(500).type('application/problem+json').json(problem(500, 'INTERNAL', 'Internal error', req.path));
};

function isZodError(err: unknown): err is { issues: ZodIssue[] } {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ZodError' && Array.isArray((err as { issues?: unknown }).issues);
}
