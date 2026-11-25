import { Middleware } from '../generated/typescript-fetch';

export interface CrossrefApiErrorDetails {
  message: string;
  method: string;
  url: string;
  status?: number;
  body?: unknown;
  code?: string;
  cause?: unknown;
}

/** Thrown for every failed request made through `createCrossrefClient`: a non-2xx response, or a request that never reached Crossref. */
export class CrossrefApiError extends Error {
  override name = 'CrossrefApiError';
  readonly method: string;
  readonly url: string;
  /** Set when Crossref answered with a non-2xx status. */
  readonly status?: number;
  /** The parsed JSON error body, or the text body (such as `Resource not found.`) when it is not JSON. */
  readonly body?: unknown;
  /** Set for network failures, for example `ECONNREFUSED`. */
  readonly code?: string;

  constructor({ message, method, url, status, body, code, cause }: CrossrefApiErrorDetails) {
    super(message, { cause });
    this.method = method;
    this.url = url;
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const crossrefErrorMiddleware: Middleware = {
  async post({ url, init, response }) {
    if (response.ok) {
      return undefined;
    }
    throw new CrossrefApiError({
      message: `Request failed with status code ${response.status}`,
      method: init.method ?? 'GET',
      url,
      status: response.status,
      body: await readBody(response),
    });
  },
  async onError({ url, init, error }) {
    // fetch reports the system error one level down, as error.cause.code
    const cause = (error as { cause?: { message?: string; code?: string } })?.cause;
    throw new CrossrefApiError({
      message: cause?.message ?? (error as Error)?.message ?? 'The request failed',
      method: init.method ?? 'GET',
      url,
      code: cause?.code ?? (error as { code?: string })?.code,
      cause: error,
    });
  },
};
