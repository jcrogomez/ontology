import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Creates a unique temporary directory for a test.
 * @returns {string} The path to the created temporary directory.
 */
export function createTempProject(): string {
  const tmpDir = os.tmpdir();
  const prefix = 'ontology-test-';
  return fs.mkdtempSync(path.join(tmpDir, prefix));
}

/**
 * Cleans up the temporary directory after a test.
 * @param {string} dirPath - The path to the temporary directory to delete.
 */
export function cleanupTempProject(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
