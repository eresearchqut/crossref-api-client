import { CrossrefApiError, createCrossrefClient } from '../src';
import { BodyType } from 'wiremock-captain';
import { MAILTO, origin, wiremock } from './Config';

const emptyWorks = {
  status: 'ok',
  'message-type': 'work-list',
  'message-version': '1.0.0',
  message: { facets: {}, 'total-results': 0, items: [], 'items-per-page': 0, query: { 'start-index': 0, 'search-terms': null } },
};

describe('createCrossrefClient', () => {
  test('defaults to the public API', () => {
    expect(createCrossrefClient().configuration.basePath).toBe('https://api.crossref.org');
  });

  test('adds mailto to every request unless the operation sets one', async () => {
    await wiremock.register(
      { method: 'GET', endpoint: '/works', queryParameters: { mailto: MAILTO, rows: '0' } },
      { status: 200, body: emptyWorks },
    );
    await wiremock.register(
      { method: 'GET', endpoint: '/types', queryParameters: { mailto: 'other@example.edu' } },
      { status: 200, body: { status: 'ok', 'message-type': 'type-list', 'message-version': '1.0.0', message: { 'total-results': 0, items: [] } } },
    );

    const { works, types } = createCrossrefClient({ url: `${origin}/`, mailto: MAILTO });

    await expect(works.worksGet({ rows: 0 })).resolves.toMatchObject({ message: { total_results: 0 } });
    await types.typesGet({ mailto: 'other@example.edu' });

    const requests = (await wiremock.getAllRequests()) as { request: { url: string } }[];
    const typesRequest = requests.find(({ request }) => request.url.startsWith('/types'));
    expect(typesRequest?.request.url.match(/mailto/g)).toHaveLength(1);
  });

  test('sends the Plus token and extra headers', async () => {
    await wiremock.register(
      {
        method: 'GET',
        endpoint: '/works',
        headers: { 'Crossref-Plus-API-Token': 'Bearer secret', 'User-Agent': 'my-app/1.0' },
      },
      { status: 200, body: emptyWorks },
    );

    const { works } = createCrossrefClient({ url: origin, plusToken: 'secret', headers: { 'User-Agent': 'my-app/1.0' } });

    await works.worksGet();
  });

  test('health resolves when the heartbeat is ok and rejects otherwise', async () => {
    const { health } = createCrossrefClient({ url: origin, mailto: MAILTO });

    await wiremock.register(
      { method: 'GET', endpoint: '/heartbeat', queryParameters: { mailto: MAILTO } },
      { status: 200, body: { 'overall-status': 'ok', version: '4.11.0' } },
    );
    await expect(health()).resolves.toBeUndefined();

    await wiremock.clearAll();
    await wiremock.register({ method: 'GET', endpoint: '/heartbeat' }, { status: 200, body: { 'overall-status': 'degraded' } });
    await expect(health()).rejects.toMatchObject({ name: 'CrossrefApiError', message: 'Crossref reported overall-status degraded' });

    await wiremock.clearAll();
    await wiremock.register({ method: 'GET', endpoint: '/heartbeat' }, { status: 503 });
    await expect(health()).rejects.toMatchObject({ status: 503 });
  });

  test('health rejects with a CrossrefApiError when the heartbeat body is not JSON', async () => {
    await wiremock.register(
      { method: 'GET', endpoint: '/heartbeat' },
      { status: 200, body: '{"overall-status"', headers: { 'Content-Type': 'application/json' } },
      { responseBodyType: BodyType.Body },
    );
    const { health } = createCrossrefClient({ url: origin });

    const error = await health().catch((e) => e);

    expect(error).toBeInstanceOf(CrossrefApiError);
    expect(error).toMatchObject({ method: 'GET', url: `${origin}/heartbeat`, status: 200 });
    expect(error.cause).toMatchObject({ name: 'SyntaxError' });
  });

  test('a JSON error body is parsed', async () => {
    const body = {
      status: 'failed',
      'message-type': 'validation-failure',
      message: [{ type: 'filter-not-available', value: 'bogus', message: "Filter 'bogus' specified but there is no such filter" }],
    };
    await wiremock.register({ method: 'GET', endpoint: '/works' }, { status: 400, body });
    const { works } = createCrossrefClient({ url: origin });

    const error = await works.worksGet({ filter: 'bogus:1' }).catch((e) => e);

    expect(error).toBeInstanceOf(CrossrefApiError);
    expect(error).toMatchObject({ message: 'Request failed with status code 400', method: 'GET', status: 400, body });
    expect(error.url).toContain('/works?filter=bogus%3A1');
  });

  test('a text error body is kept as text', async () => {
    await wiremock.register(
      { method: 'GET', endpoint: '/works/10.5555%2Fmissing' },
      { status: 404, body: 'Resource not found.', headers: { 'Content-Type': 'text/plain' } },
    );
    const { works } = createCrossrefClient({ url: origin });

    await expect(works.worksDoiGet({ doi: '10.5555/missing' })).rejects.toMatchObject({ status: 404, body: 'Resource not found.' });
  });

  test('a network failure throws a CrossrefApiError with the code and no status', async () => {
    const { works } = createCrossrefClient({ url: 'http://127.0.0.1:59999' });

    const error = await works.worksGet().catch((e) => e);

    expect(error).toBeInstanceOf(CrossrefApiError);
    expect(error.status).toBeUndefined();
    expect(error.code).toBe('ECONNREFUSED');
    expect(error.method).toBe('GET');
  });
});
