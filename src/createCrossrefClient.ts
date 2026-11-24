import {
  BaseAPI,
  Configuration,
  ConfigurationParameters,
  FundersApi,
  JournalsApi,
  LicensesApi,
  MembersApi,
  Middleware,
  PrefixesApi,
  TypesApi,
  WorksApi,
} from '../generated/typescript-fetch';
import { CrossrefApiError, crossrefErrorMiddleware } from './CrossrefApiError';

export const DEFAULT_CROSSREF_URL = 'https://api.crossref.org';

export interface CrossrefClientOptions {
  /** Origin of the API. Defaults to `https://api.crossref.org`. */
  url?: string;
  /** Contact email added as the `mailto` parameter of every request, which routes requests to Crossref's polite pool. A `mailto` passed to an operation wins. */
  mailto?: string;
  /** Crossref Metadata Plus token, sent as `Crossref-Plus-API-Token: Bearer <token>`. */
  plusToken?: string;
  /** Extra request headers, for example a `User-Agent` that names your application. */
  headers?: Record<string, string>;
  fetchApi?: ConfigurationParameters['fetchApi'];
}

export interface CrossrefClient {
  works: WorksApi;
  funders: FundersApi;
  journals: JournalsApi;
  licenses: LicensesApi;
  members: MembersApi;
  prefixes: PrefixesApi;
  types: TypesApi;
  configuration: Configuration;
  /** Resolves when Crossref's `/heartbeat` reports `ok`, and rejects with a `CrossrefApiError` otherwise. */
  health(): Promise<void>;
}

function mailtoMiddleware(mailto: string): Middleware {
  return {
    async pre({ url, init }) {
      const target = new URL(url);
      if (target.searchParams.has('mailto')) {
        return undefined;
      }
      target.searchParams.set('mailto', mailto);
      return { url: target.toString(), init };
    },
  };
}

// The spec does not describe /heartbeat, so it is requested through the generated runtime to share the middleware.
class HeartbeatApi extends BaseAPI {
  async heartbeat(): Promise<{ status?: string; url: string }> {
    const response = await this.request({ path: '/heartbeat', method: 'GET', headers: {} });
    let body: { 'overall-status'?: string } | null;
    try {
      body = await response.json();
    } catch (error) {
      throw new CrossrefApiError({
        message: `Could not read the heartbeat response: ${(error as Error)?.message}`,
        method: 'GET',
        url: response.url,
        status: response.status,
        cause: error,
      });
    }
    return { status: body?.['overall-status'], url: response.url };
  }
}

export function createCrossrefClient(options: CrossrefClientOptions = {}): CrossrefClient {
  const { url = DEFAULT_CROSSREF_URL, mailto, plusToken, headers, fetchApi } = options;

  const requestHeaders: Record<string, string> = { ...headers };
  if (plusToken) {
    requestHeaders['Crossref-Plus-API-Token'] = `Bearer ${plusToken}`;
  }

  const middleware: Middleware[] = mailto ? [mailtoMiddleware(mailto)] : [];
  middleware.push(crossrefErrorMiddleware);

  const configuration = new Configuration({
    basePath: url.replace(/\/+$/, ''),
    headers: requestHeaders,
    fetchApi,
    middleware,
  });

  const heartbeat = new HeartbeatApi(configuration);

  return {
    works: new WorksApi(configuration),
    funders: new FundersApi(configuration),
    journals: new JournalsApi(configuration),
    licenses: new LicensesApi(configuration),
    members: new MembersApi(configuration),
    prefixes: new PrefixesApi(configuration),
    types: new TypesApi(configuration),
    configuration,
    health: async () => {
      const { status, url: heartbeatUrl } = await heartbeat.heartbeat();
      if (status !== 'ok') {
        throw new CrossrefApiError({
          message: `Crossref reported overall-status ${status ?? 'missing'}`,
          method: 'GET',
          url: heartbeatUrl,
          status: 200,
        });
      }
    },
  };
}
