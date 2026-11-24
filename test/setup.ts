import { wiremock } from './Config';

afterEach(async () => {
  const unmatched = await wiremock.getUnmatchedRequests();
  await wiremock.clearAll();
  expect(unmatched).toEqual([]);
});
