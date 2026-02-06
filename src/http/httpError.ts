export class HttpError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(opts: { status: number; errorCode: string; message: string; details?: Record<string, unknown> }) {
    super(opts.message);
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.details = opts.details;
  }
}

