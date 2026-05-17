// Use CommonJS for compatibility
const esbuild = require('esbuild');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');

// Find all TypeScript entry points in src/
function findEntryPoints(dir) {
  const entries = [];
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      entries.push(...findEntryPoints(fullPath));
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      // Check if it's likely an entry point (exports something)
      entries.push(fullPath);
    }
  }
  
  return entries;
}

const entryPoints = findEntryPoints(join(process.cwd(), 'src'));

// If no entry points found, use default index.ts
if (entryPoints.length === 0) {
  entryPoints.push(join(process.cwd(), 'src/index.ts'));
}

const config = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  minify: false,
  external: [
    // External dependencies that shouldn't be bundled
    'zod',
    'fast-check',
    'uuid',
    '@types/*'
  ],
};

// Build for production
if (process.argv.includes('--production')) {
  config.minify = true;
  config.sourcemap = false;
}

// Watch mode
if (process.argv.includes('--watch')) {
  esbuild.context(config).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  }).catch(err => {
    console.error('Failed to start watch mode:', err);
    process.exit(1);
  });
} else {
  // One-time build
  esbuild.build(config).then(() => {
    console.log('Build completed successfully');
  }).catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}