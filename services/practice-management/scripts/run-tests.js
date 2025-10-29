#!/usr/bin/env node
const { spawnSync } = require('child_process');

const path = require('path');

const forwarded = process.argv
  .slice(2)
  .filter((arg) => arg !== '--runInBand');

const testsDir = path.join(__dirname, '..', 'dist', 'tests');
const fs = require('fs');

const testFiles = fs
  .readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join(testsDir, file));

const result = spawnSync('node', ['--test', ...testFiles, ...forwarded], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  // eslint-disable-next-line no-console
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
