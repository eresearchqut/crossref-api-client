# crossref-api-client

OpenAPI client for the [Crossref REST API](https://api.crossref.org), generated from Crossref's published Swagger 2.0 spec.

## Usage

### Node
1. Create a Personal Access Token (PAT) in GitHub, with the scope: `read:packages`
2. Create an `.npmrc` file in your project's root directory:
```
@eresearchqut:registry=https://npm.pkg.github.com/
```
3. Authenticate npm with the GitHub Package Registry
```
npm login --scope=@eresearchqut --registry=https://npm.pkg.github.com
--
username: <your github username>
password: <your github PAT>
```
4. Using your package manager, add `@eresearchqut/crossref-api-client` to your project dependencies.
```
npm install @eresearchqut/crossref-api-client
```

```ts
import { createCrossrefClient } from '@eresearchqut/crossref-api-client';

const { works, journals, funders } = createCrossrefClient({
  mailto: 'research.data@example.edu',
  headers: { 'User-Agent': 'my-app/1.0 (https://example.edu/my-app)' },
});

const { message } = await works.worksDoiGet({ doi: '10.1038/s41586-020-2649-2' });
const results = await works.worksGet({ queryAuthor: 'Josiah Carberry', rows: 20, select: 'DOI,title' });
```

`createCrossrefClient` returns `works`, `funders`, `journals`, `licenses`, `members`, `prefixes` and `types`, plus the underlying `configuration` and a `health()` function. `url` defaults to `https://api.crossref.org`. Crossref asks clients to identify themselves, and requests that do so are served from the faster "polite" pool, so pass `mailto` (added as the `mailto` query parameter of every request unless the operation sets its own) and a descriptive `User-Agent` in `headers`. `plusToken` sends a Metadata Plus key in the `Crossref-Plus-API-Token` header. `fetchApi` replaces the global `fetch`. `health()` calls `/heartbeat` and rejects unless Crossref reports `overall-status: ok`.

A request rejects with a `CrossrefApiError` when Crossref answers with a non-2xx status or the request never reaches it. `health()` also rejects with one when the heartbeat body cannot be read. It carries `method`, `url` and `message`, plus `status` and the response `body` for a response, or the network `code` (such as `ECONNREFUSED`) otherwise. The body is parsed JSON when Crossref sends JSON (for example the `validation-failure` message list on a 400) and text otherwise (a 404 is `Resource not found.`). If a generated operation gets a successful response whose body is not valid JSON or fails part way through, it rejects with the native `SyntaxError` or `TypeError`, because the generated runtime parses the body after the error middleware has run. The generated `ResponseError` and `FetchError` are not thrown by clients made this way. The generated `Configuration` and API classes are still exported if you want to build them yourself. Every model is exported by its generated name (`Work`) and also under a `Crossref` namespace (`Crossref.Work`).

The works routes (`worksGet`, `fundersIdWorksGet`, `journalsIssnWorksGet`, `membersIdWorksGet`, `prefixesPrefixWorksGet` and `typesIdWorksGet`) accept the field queries Crossref supports, such as `queryAuthor`, `queryBibliographic` and `queryContainerTitle`, which are sent as `query.author` and so on.

To read every result of a works or list route, pass a page function to `paginate`, which yields items lazily, or to `collect`, which returns them all. The helper uses Crossref's deep paging cursor, starting at `*` and following `next-cursor`, because `offset` is limited to 10,000 results. It stops on a page shorter than `rows`, or once it has `total-results` items. `rows` defaults to 100 and Crossref allows at most 1,000. The page function puts `cursor` and `rows` on the request:

```ts
import { collect, paginate } from '@eresearchqut/crossref-api-client';

const dois = await collect(
  paginate((cursor, rows) => works.worksGet({ cursor, rows, filter: 'from-pub-date:2024', select: 'DOI' })),
);

for await (const work of paginate((cursor, rows) => journals.journalsIssnWorksGet({ issn: '0028-0836', cursor, rows }), { rows: 500 })) {
  // break to stop requesting pages
}
```

Crossref rate limits requests and answers `429` when the limit is exceeded. The current limits are reported in the `x-rate-limit-limit` and `x-rate-limit-interval` response headers, and at the time of writing a request with `mailto` is allowed three per second, against one per second without it. The client does not retry, so callers that page through large result sets should handle `CrossrefApiError` with `status === 429` and back off.

## Development

The spec is not committed. The build downloads it from `https://api.crossref.org/swagger-docs`, so building needs network access. Set `CROSSREF_SPEC_URL` to use another source. In GitHub Actions, the `build` workflow reads the `CROSSREF_SPEC_URL` repository variable, and the manual `publish-prerelease` workflow takes a `spec_url` input; both fall back to the default when blank.

Generation first runs `scripts/transformSpec.js`, which downloads the spec and writes `generated/spec.transformed.json` (git-ignored), and the client is generated from that. The generated `FromJSON` functions silently drop every field the spec does not name, so gaps in the spec become lost data. The transform fixes the spec where it disagrees with what api.crossref.org returns:

- The `{issn}` path parameter is declared as an array, and is changed to a string.
- The spec does not list the `query.<field>` parameters. They are added to every works route, using the field list from the API's own validation message.
- Nullable values use `x-oneOf`, which Swagger 2.0 does not support and the generator ignores. Each is replaced with the typed variant marked `x-nullable`.
- `DateAndVersion` is missing `date-time` and `timestamp`, `WorkFunder` is missing `award-info`, `WorkEvent` is missing `acronym`, `number`, `sponsor` and `theme`, and `Work` is missing `award` and `award-start` (grants). These are added.
- `Journal.issn-type` is declared as a single object but is an array, and `Journal.coverage-type` is keyed by `all`, `current` and `backfile` rather than by content type as on members. Both are corrected.
- `CoverageFull` spells `references-backfile` as `references-backfie`, which is renamed.
- `Coverage`, `CoverageFull` and `Flags` gain `additionalProperties`, so coverage and flag keys Crossref adds later are kept rather than dropped.

Other quirks of the generated code remain:

- The spec has no `operationId`s, so the generator names each operation from its path and method, for example `worksGet` for `GET /works`, `worksDoiGet` for `GET /works/{doi}` and `journalsIssnWorksGet` for `GET /journals/{issn}/works`. Renaming a path parameter upstream would rename the operation.
- Hyphenated JSON keys become underscores on the models (`message_type`, `total_results`, `next_cursor`, `date_time`, `date_parts`), while `DOI` and `ISSN` keep their case.
- The spec's `Date` definition is generated as `ModelDate` to avoid shadowing the global `Date`.
- `/heartbeat` is not in the spec, so `health()` calls it directly.

Generation runs the `@openapitools/openapi-generator-cli` npm package, so it needs Java 21 or later on the machine. The generator version is pinned in `openapitools.json`.

`test/Contract.test.ts` deserialises responses recorded from api.crossref.org (`test/fixtures`), including a sample of every work type, and asserts that every field survives a `FromJSON` and `ToJSON` round trip, so it fails if the spec or the transform stops matching the real JSON. Re-record the fixtures when Crossref changes its responses.

Tests run against a WireMock container started by `jest-testcontainers`. Each test registers its own stubs with [wiremock-captain](https://github.com/wbd-open-source/wiremock-captain), and `test/setup.ts` fails any test that sends a request no stub matched.

```
npm run build
npm test
```
