const fs = require('fs');
const path = require('path');
const { openapiOverlay, parseFile } = require('openapi-format');

const OVERLAY = path.join(__dirname, 'crossref.overlay.yaml');

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

async function transformSpec(spec) {
  const overlaySet = await parseFile(OVERLAY);
  const { data, resultData } = await openapiOverlay(JSON.parse(JSON.stringify(spec)), { overlaySet });
  if (resultData.unusedActions.length > 0) {
    const targets = resultData.unusedActions.map((action) => action.target).join('\n  ');
    throw new Error(`Overlay actions matched nothing in the spec:\n  ${targets}`);
  }
  replaceOneOf(data.definitions);
  return data;
}

const DEFAULT_SPEC_URL = 'https://api.crossref.org/swagger-docs';

async function main() {
  const url = process.env.CROSSREF_SPEC_URL || DEFAULT_SPEC_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status}`);
  }
  const output = path.join(__dirname, '..', 'generated');
  const original = await response.json();
  const spec = await transformSpec(original);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'spec.json'), JSON.stringify(original, null, 2));
  fs.writeFileSync(path.join(output, 'spec.transformed.json'), JSON.stringify(spec, null, 2));
  console.log(`Downloaded ${url} (Crossref REST API ${spec.info?.version})`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { transformSpec };
