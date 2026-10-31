import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

// Ensure dist output dirs exist and copy webview stylesheets to dist/webview
fs.mkdirSync('dist/webview', { recursive: true });

function copyWebviewStyles() {
  fs.mkdirSync('dist/webview', { recursive: true });
  const styles = [
    { src: 'webview-src/shared/theme.css', dest: 'dist/webview/theme.css' },
    { src: 'webview-src/connections/tree.css', dest: 'dist/webview/tree.css' },
    { src: 'webview-src/dataPanel/grid.css', dest: 'dist/webview/grid.css' },
    { src: 'webview-src/documentation/docs.css', dest: 'dist/webview/docs.css' },
    { src: 'webview-src/documentation/viewer.css', dest: 'dist/webview/viewer.css' },
    { src: 'webview-src/cloud/cloud.css', dest: 'dist/webview/cloud.css' },
  ];
  for (const { src, dest } of styles) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
}

copyWebviewStyles();

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
  },
  // Documentation Webview (Browser)
  {
    entryPoints: ['webview-src/documentation/main.ts'],
    bundle: true,
    outfile: 'dist/webview/documentation.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  },
  // Documentation Viewer Panel Webview (Browser)
  {
    entryPoints: ['webview-src/documentation/viewer.ts'],
    bundle: true,
    outfile: 'dist/webview/documentationViewer.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  },
  // AxarDB Cloud Webview (Browser)
  {
    entryPoints: ['webview-src/cloud/main.ts'],
    bundle: true,
    outfile: 'dist/webview/cloud.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
  }
];

async function run() {
  try {
    copyWebviewStyles();
    if (isWatch) {
      console.log('Watching for changes...');
      const contexts = await Promise.all(buildConfigs.map(cfg => esbuild.context(cfg)));
      await Promise.all(contexts.map(ctx => ctx.watch()));
      // Watch stylesheet changes
      fs.watch('webview-src', { recursive: true }, (event, filename) => {
        if (filename && filename.endsWith('.css')) {
          copyWebviewStyles();
          console.log(`Updated stylesheet: ${filename}`);
        }
      });
    } else {
      await Promise.all(buildConfigs.map(cfg => esbuild.build(cfg)));
      copyWebviewStyles();
      console.log('Build completed successfully.');
    }
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

run();
