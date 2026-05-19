#!/usr/bin/env node
// Wrapper to run init command for testing purposes
// This avoids the "bun run" argument parsing issue

const { spawn } = require('child_process');
const path = require('path');

const cliPath = process.argv[2];
const subcommand = process.argv[3] || 'init';

console.log('Running:', cliPath, subcommand);

// Use bun directly to run the CLI file
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';

const child = spawn(bun, [cliPath, subcommand], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});