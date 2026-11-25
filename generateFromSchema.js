const {execSync} = require('child_process');

execSync('node scripts/transformSpec.js', {stdio: 'inherit'});

execSync(
    'openapi-generator-cli generate --skip-validate-spec --skip-operation-example -i generated/spec.transformed.json -g typescript-fetch ' +
    '--additional-properties=supportsES6=true,withInterfaces=true,platform=node,modelPropertyNaming=original,paramPropertyNaming=original ' +
    '-o generated/typescript-fetch',
    {stdio: 'inherit'}
);
