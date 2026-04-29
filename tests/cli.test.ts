import { describe, expect, it } from 'vitest';

import { createCliProgram } from '../src/cli/program.js';

describe('createCliProgram', () => {
  it('prints the version command output', async () => {
    let output = '';
    const program = createCliProgram({
      version: '0.1.0-test',
      write: (text: string) => {
        output += text;
      }
    });

    await program.parseAsync(['node', 'onto', 'version']);

    expect(output).toBe('0.1.0-test\n');
  });

  it('shows help output', async () => {
    let output = '';
    const program = createCliProgram({
      version: '0.1.0-test'
    });

    program.configureOutput({
      writeOut: (text: string) => {
        output += text;
      },
      writeErr: (text: string) => {
        output += text;
      }
    });

    program.exitOverride();

    await expect(
      program.parseAsync(['node', 'onto', '--help'])
    ).rejects.toMatchObject({
      code: 'commander.helpDisplayed'
    });

    expect(output).toContain('Usage: onto');
    expect(output).toContain('version');
  });
});
