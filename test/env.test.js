import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from '../src/env.js';

test('loads .env values without overwriting existing environment variables', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deadline-tracker-env-'));
  const envPath = join(directory, '.env');
  const fileKey = 'DEADLINE_TRACKER_TEST_FILE_VALUE';
  const existingKey = 'DEADLINE_TRACKER_TEST_EXISTING_VALUE';
  const originalFileValue = process.env[fileKey];
  const originalExistingValue = process.env[existingKey];

  try {
    writeFileSync(envPath, `${fileKey}="from file"\n${existingKey}=from file\n`);
    process.env[existingKey] = 'from process';
    delete process.env[fileKey];

    loadEnvFile(envPath);

    assert.equal(process.env[fileKey], 'from file');
    assert.equal(process.env[existingKey], 'from process');
  } finally {
    if (originalFileValue === undefined) delete process.env[fileKey];
    else process.env[fileKey] = originalFileValue;
    if (originalExistingValue === undefined) delete process.env[existingKey];
    else process.env[existingKey] = originalExistingValue;
    rmSync(directory, { recursive: true, force: true });
  }
});
