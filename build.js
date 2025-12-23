import * as esbuild from 'esbuild';

// Bundle the background script with dependencies
await esbuild.build({
  entryPoints: ['src/background.js'],
  bundle: true,
  outfile: 'dist/background.js',
  format: 'esm',
  platform: 'browser',
  target: 'chrome100',
  minify: false,
  sourcemap: true,
});

console.log('Build complete! Output in dist/');
