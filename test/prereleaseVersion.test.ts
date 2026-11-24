import semver from 'semver';
import { prereleaseVersion } from '../scripts/prereleaseVersion';

const now = new Date('2026-11-24T01:42:30.123Z');

describe('prereleaseVersion', () => {
  test.each([
    ['ppettitau-crossref-openapi-client', '1.0.0-ppettitau-crossref-openapi-client.20261124014230', 'pre-ppettitau-crossref-openapi-client'],
    ['Feature/Add_Thing', '1.0.0-feature-add-thing.20261124014230', 'pre-feature-add-thing'],
    ['0123', '1.0.0-branch-0123.20261124014230', 'pre-branch-0123'],
    ['_', '1.0.0-branch.20261124014230', 'pre-branch'],
    ['007-fix', '1.0.0-007-fix.20261124014230', 'pre-007-fix'],
  ])('%s', (branch, version, tag) => {
    const result = prereleaseVersion(branch, '1.0.0', now);

    expect(result).toEqual({ version, tag });
    expect(semver.valid(result.version)).toBe(version);
  });

  test('drops an existing prerelease and trims a long branch at a word boundary', () => {
    const { version } = prereleaseVersion(`${'a'.repeat(39)}-${'b'.repeat(10)}`, '2.3.4-beta.1', now);

    expect(version).toBe(`2.3.4-${'a'.repeat(39)}.20261124014230`);
  });
});
