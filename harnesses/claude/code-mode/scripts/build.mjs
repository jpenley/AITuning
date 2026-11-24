import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
await build({ entryPoints: ['scripts/broker.mjs'], outfile: 'dist/broker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: true, legalComments: 'eof', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, plugins: [{
  name: 'report-loader-fallbacks',
  setup(builder) {
    builder.onLoad({filter:/emscripten-module-[A-Z0-9]+\.mjs$/}, async args => {
      const source=readFileSync(args.path,'utf8');
      const handlers=source.match(/catch\s*\{\s*\}/g)||[];
      if(handlers.length!==2) throw new Error('Pinned QuickJS loader changed; review its fallback handlers before rebuilding');
      // Keep both upstream fallbacks, but retain their diagnostics instead of swallowing errors.
      const contents=source.replace(/catch\s*\{\s*\}/g,'catch(error){console.error("QuickJS loader fallback: " + String(error));}');
      return {contents,loader:'js'};
    });
  }
}] });
copyFileSync('node_modules/@jitl/quickjs-singlefile-mjs-release-sync/LICENSE', 'dist/QUICKJS-LICENSE');
copyFileSync('node_modules/quickjs-emscripten-core/LICENSE', 'dist/CORE-LICENSE');
