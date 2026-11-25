const { version: packageVersion } = require('../package.json');

/**
 * Builds the prerelease version and dist tag for a branch, e.g. `1.0.0-my-branch.20260928014636` under `pre-my-branch`.
 */
function prereleaseVersion(branch, baseVersion = packageVersion, now = new Date()) {
  let slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  // SemVer rejects empty prerelease identifiers and numeric ones with leading zeros.
  slug = slug || 'branch';
  if (/^[0-9]+$/.test(slug)) {
    slug = `branch-${slug}`;
  }
  const base = baseVersion.replace(/-.*/, '');
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return { version: `${base}-${slug}.${timestamp}`, tag: `pre-${slug}` };
}

if (require.main === module) {
  const { version, tag } = prereleaseVersion(process.argv[2] || '');
  console.log(`${version} ${tag}`);
}

module.exports = { prereleaseVersion };
