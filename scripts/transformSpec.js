const fs = require('fs');
const path = require('path');

// The spec has no operationIds, so the generator would invent names such as `worksDoiGet`.
// Keyed by path so that a path added upstream fails the build instead of getting an invented name.
const OPERATION_IDS = {
  '/works': 'listWorks',
  '/works/{doi}': 'getWork',
  '/works/{doi}/agency': 'getWorkAgency',
  '/funders': 'listFunders',
  '/funders/{id}': 'getFunder',
  '/funders/{id}/works': 'listFunderWorks',
  '/journals': 'listJournals',
  '/journals/{issn}': 'getJournal',
  '/journals/{issn}/works': 'listJournalWorks',
  '/licenses': 'listLicenses',
  '/members': 'listMembers',
  '/members/{id}': 'getMember',
  '/members/{id}/works': 'listMemberWorks',
  '/prefixes/{prefix}': 'getPrefix',
  '/prefixes/{prefix}/works': 'listPrefixWorks',
  '/types': 'listTypes',
  '/types/{id}': 'getType',
  '/types/{id}/works': 'listTypeWorks',
};

// Every works route accepts these, but the spec only lists the plain `query` parameter.
const WORKS_FIELD_QUERIES = [
  'affiliation',
  'author',
  'bibliographic',
  'chair',
  'container-title',
  'contributor',
  'degree',
  'description',
  'editor',
  'event-acronym',
  'event-location',
  'event-name',
  'event-sponsor',
  'event-theme',
  'funder-name',
  'publisher-location',
  'publisher-name',
  'standards-body-acronym',
  'standards-body-name',
  'title',
  'translator',
];

function nameOperations(spec) {
  for (const [route, methods] of Object.entries(spec.paths || {})) {
    if (!methods.get) {
      continue;
    }
    const operationId = OPERATION_IDS[route];
    if (!operationId) {
      throw new Error(`No operationId for GET ${route}; add one to OPERATION_IDS`);
    }
    methods.get.operationId = operationId;
  }
}

// The spec types the `{issn}` path parameter as an array, which the generator joins with commas.
function fixPathParameters(spec) {
  for (const methods of Object.values(spec.paths || {})) {
    for (const operation of Object.values(methods)) {
      for (const parameter of operation.parameters || []) {
        if (parameter.in === 'path' && parameter.type === 'array') {
          parameter.type = 'string';
          delete parameter.items;
        }
      }
    }
  }
}

function addFieldQueries(spec) {
  for (const methods of Object.values(spec.paths || {})) {
    const operation = methods.get;
    const parameters = operation?.parameters || [];
    if (!parameters.some((parameter) => parameter.name === 'select')) {
      continue;
    }
    for (const field of WORKS_FIELD_QUERIES) {
      parameters.push({
        name: `query.${field}`,
        in: 'query',
        type: 'string',
        required: false,
        description: `Query the ${field} field`,
      });
    }
  }
}

// `x-oneOf` describes a nullable value, but the generator ignores it and types the value as `any`.
function replaceOneOf(schema) {
  if (Array.isArray(schema)) {
    schema.forEach(replaceOneOf);
    return;
  }
  if (!schema || typeof schema !== 'object') {
    return;
  }
  const variants = schema['x-oneOf'];
  if (Array.isArray(variants)) {
    const typed = variants.find((variant) => variant && variant.type);
    delete schema['x-oneOf'];
    if (typed) {
      Object.assign(schema, typed, { 'x-nullable': true });
    }
  }
  Object.values(schema).forEach(replaceOneOf);
}

function addProperties(definitions, name, properties) {
  const definition = definitions[name];
  if (!definition?.properties) {
    throw new Error(`Expected a ${name} definition with properties`);
  }
  for (const [key, schema] of Object.entries(properties)) {
    definition.properties[key] ??= schema;
  }
}

// Each fix matches what api.crossref.org returns; test/Contract.test.ts fails when a response field is dropped.
function fixDefinitions(spec) {
  const definitions = spec.definitions;

  // `indexed` carries the same fields as the other dates, plus a version.
  addProperties(definitions, 'DateAndVersion', {
    'date-time': { type: 'string', format: 'date-time' },
    timestamp: { type: 'integer', format: 'int64' },
  });

  definitions.WorkFunderAwardInfo = {
    type: 'object',
    properties: { 'award-number': { type: 'array', items: { type: 'string' } } },
  };
  addProperties(definitions, 'WorkFunder', {
    'award-info': { type: 'array', items: { $ref: '#/definitions/WorkFunderAwardInfo' } },
  });

  addProperties(definitions, 'WorkEvent', {
    acronym: { type: 'string' },
    number: { type: 'string' },
    sponsor: { type: 'array', items: { type: 'string' } },
    theme: { type: 'string' },
  });

  // Grants carry their award at the top level of the work.
  addProperties(definitions, 'Work', {
    award: { type: 'string' },
    'award-start': { $ref: '#/definitions/DateParts' },
  });

  // A journal lists one entry per ISSN, and its coverage is not broken down by work type as a member's is.
  definitions.Journal.properties['issn-type'] = { type: 'array', items: { $ref: '#/definitions/JournalIssnType' } };
  definitions.JournalCoverageType = {
    type: 'object',
    properties: Object.fromEntries(['all', 'current', 'backfile'].map((key) => [key, { $ref: '#/definitions/Coverage' }])),
  };
  definitions.Journal.properties['coverage-type'] = { $ref: '#/definitions/JournalCoverageType' };

  const coverageFull = definitions.CoverageFull.properties;
  if (coverageFull['references-backfie']) {
    coverageFull['references-backfile'] = coverageFull['references-backfie'];
    delete coverageFull['references-backfie'];
  }

  // Crossref adds coverage and flag keys as it collects new metadata, so keep keys the spec does not list yet.
  definitions.Coverage.additionalProperties = { type: 'number' };
  definitions.CoverageFull.additionalProperties = { type: 'number' };
  definitions.Flags.additionalProperties = { type: 'boolean' };
}

function transformSpec(spec) {
  const result = JSON.parse(JSON.stringify(spec));
  nameOperations(result);
  fixPathParameters(result);
  addFieldQueries(result);
  replaceOneOf(result.definitions);
  fixDefinitions(result);
  return result;
}

const DEFAULT_SPEC_URL = 'https://api.crossref.org/swagger-docs';

async function main() {
  const url = process.env.CROSSREF_SPEC_URL || DEFAULT_SPEC_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status}`);
  }
  const output = path.join(__dirname, '..', 'generated', 'spec.transformed.json');
  const spec = transformSpec(await response.json());
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(spec));
  console.log(`Downloaded ${url} (Crossref REST API ${spec.info?.version})`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { transformSpec };
