import { EndpointFeature, WireMock } from 'wiremock-captain';
import { FetchAPI } from '../generated/typescript-fetch';
import { createCrossrefClient } from '../src';

export const MAILTO = 'research@example.edu';

export const origin = `http://${global.__TESTCONTAINERS_CROSSREF_IP__}:${global.__TESTCONTAINERS_CROSSREF_PORT_8080__}`;

export const wiremock = new WireMock(origin, { requestEndpointFeature: EndpointFeature.UrlPath });

export const configuration = createCrossrefClient({
  url: origin,
  mailto: MAILTO,
  fetchApi: fetch as unknown as FetchAPI,
}).configuration;
