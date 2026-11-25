import { MembersApi, WorksApi, collect, paginate } from '../src';
import { MAILTO, configuration, wiremock } from './Config';

const dois = (...ids: string[]) => ids.map((id) => ({ DOI: `10.5555/${id}`, type: 'journal-article', prefix: '10.5555', member: '1' }));

const worksPage = (items: object[], total: number, nextCursor?: string) => ({
  status: 'ok',
  'message-type': 'work-list',
  'message-version': '1.0.0',
  message: {
    facets: {},
    'total-results': total,
    items,
    'items-per-page': items.length,
    query: { 'start-index': 0, 'search-terms': null },
    ...(nextCursor ? { 'next-cursor': nextCursor } : {}),
  },
});

describe('paginate', () => {
  const worksApi = new WorksApi(configuration);

  const stubWorksPage = (cursor: string, items: object[], total: number, nextCursor?: string) =>
    wiremock.register(
      { method: 'GET', endpoint: '/works', queryParameters: { cursor, rows: '2', mailto: MAILTO, filter: 'type:journal-article' } },
      { status: 200, body: worksPage(items, total, nextCursor) },
    );

  const pages = () => paginate((cursor, rows) => worksApi.worksGet({ cursor, rows, filter: 'type:journal-article' }), { rows: 2 });

  test('follows next-cursor until a short page', async () => {
    await stubWorksPage('*', dois('a', 'b'), 5, 'c1');
    await stubWorksPage('c1', dois('c', 'd'), 5, 'c2');
    await stubWorksPage('c2', dois('e'), 5, 'c3');

    const works = await collect(pages());
    expect(works.map((work) => work.DOI)).toEqual(['a', 'b', 'c', 'd', 'e'].map((id) => `10.5555/${id}`));
  });

  test('stops once total-results items have been read', async () => {
    await stubWorksPage('*', dois('a', 'b'), 4, 'c1');
    await stubWorksPage('c1', dois('c', 'd'), 4, 'c2');

    expect(await collect(pages())).toHaveLength(4);
  });

  test('stops when there is no next-cursor', async () => {
    await stubWorksPage('*', dois('a', 'b'), 10);

    expect(await collect(pages())).toHaveLength(2);
  });

  test('stops requesting pages when the caller stops iterating', async () => {
    await stubWorksPage('*', dois('a', 'b'), 5, 'c1');

    for await (const work of pages()) {
      expect(work.DOI).toEqual('10.5555/a');
      break;
    }
  });

  test('works with the other list endpoints', async () => {
    const membersApi = new MembersApi(configuration);
    await wiremock.register(
      { method: 'GET', endpoint: '/members', queryParameters: { cursor: '*', rows: '10' } },
      {
        status: 200,
        body: {
          status: 'ok',
          'message-type': 'member-list',
          'message-version': '1.0.0',
          message: { 'items-per-page': 10, query: { 'start-index': 0, 'search-terms': null }, 'total-results': 0, items: [] },
        },
      },
    );

    expect(await collect(paginate((cursor, rows) => membersApi.membersGet({ cursor, rows }), { rows: 10 }))).toEqual([]);
  });
});
