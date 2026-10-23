import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

// Ensure dist output dirs exist
fs.mkdirSync('dist/webview', { recursive: true });

/** @type {esbuild.BuildOptions[]} */
const buildConfigs = [
  // Extension host (Node)
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    logLevel: 'info',
  },
  // Connections Webview (Browser)
  {
    entryPoints: ['webview-src/connections/main.ts'],
    bundle: true,
    outfile: 'dist/webview/connections.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  },
  // DataPanel Webview (Browser)
  {
    entryPoints: ['webview-src/dataPanel/main.ts'],
    bundle: true,
    outfile: 'dist/webview/dataPanel.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  }
];

async function run() {
  try {
    if (isWatch) {
      console.log('Watching for changes...');
      const contexts = await Promise.all(buildConfigs.map(cfg => esbuild.context(cfg)));
      await Promise.all(contexts.map(ctx => ctx.watch()));
    } else {
      await Promise.all(buildConfigs.map(cfg => esbuild.build(cfg)));
      console.log('Build completed successfully.');
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

run();
