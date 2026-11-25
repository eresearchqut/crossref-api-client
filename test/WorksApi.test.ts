import { JournalsApi, WorksApi } from '../src';
import { MAILTO, configuration, wiremock } from './Config';
import work from './fixtures/work.json';
import journal from './fixtures/journal.json';

const doi = '10.1038/s41586-020-2649-2';

describe('WorksApi', () => {
  const worksApi = new WorksApi(configuration);

  test('worksDoiGet encodes the slash in the DOI', async () => {
    await wiremock.register(
      { method: 'GET', endpoint: '/works/10.1038%2Fs41586-020-2649-2', queryParameters: { mailto: MAILTO } },
      { status: 200, body: work },
    );

    const { message } = await worksApi.worksDoiGet({ doi });

    expect(message.DOI).toEqual(doi);
    expect(message.title?.[0]).toEqual('Array programming with NumPy');
  });

  test('worksGet sends field queries with their dotted names', async () => {
    await wiremock.register(
      {
        method: 'GET',
        endpoint: '/works',
        queryParameters: {
          'query.author': 'Josiah Carberry',
          'query.container-title': 'Psychoceramics',
          filter: 'from-pub-date:2020',
          select: 'DOI,title',
          sort: 'published',
          order: 'asc',
          rows: '5',
        },
      },
      { status: 200, body: { status: 'ok', 'message-type': 'work-list', 'message-version': '1.0.0', message: { 'total-results': 0, items: [] } } },
    );

    const { message } = await worksApi.worksGet({
      queryAuthor: 'Josiah Carberry',
      queryContainerTitle: 'Psychoceramics',
      filter: 'from-pub-date:2020',
      select: 'DOI,title',
      sort: 'published',
      order: 'asc',
      rows: 5,
    });

    expect(message.total_results).toEqual(0);
  });
});

describe('JournalsApi', () => {
  test('journalsIssnGet puts a single ISSN in the path', async () => {
    await wiremock.register({ method: 'GET', endpoint: '/journals/0028-0836' }, { status: 200, body: journal });

    const { message } = await new JournalsApi(configuration).journalsIssnGet({ issn: '0028-0836' });

    expect(message.title).toEqual('Nature');
  });
});
