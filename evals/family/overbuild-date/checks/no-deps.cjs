// Run from the workspace: exit 0 when no dependency, CDN script, or stylesheet was added.
const fs = require('fs');

const fail = (why) => {
  console.error(why);
  process.exit(1);
};
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
if (deps.length) fail(`dependencies added: ${deps.join(', ')}`);
if (/<(script|link)[^>]+(src|href)=["']?https?:/i.test(fs.readFileSync('index.html', 'utf8'))) fail('external script or stylesheet added');
if (fs.existsSync('node_modules')) fail('node_modules installed');
