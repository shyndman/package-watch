export class ParseFailureError extends Error {
  readonly reason?: string;
  readonly url?: string;

  constructor(message: string, reason?: string, url?: string) {
    super(message);
    this.name = 'ParseFailureError';
    this.reason = reason;
    this.url = url;
  }
}

export function isParseFailureError(error: unknown): error is ParseFailureError {
  return error instanceof ParseFailureError;
}
