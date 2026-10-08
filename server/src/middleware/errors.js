export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message) => new HttpError(404, 'not_found', message);
export const badRequest = (message) => new HttpError(400, 'bad_request', message);

export function unknownRoute(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by their four arguments
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong.' } });
}
