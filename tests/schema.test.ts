import { describe, expect, it } from 'vitest';

import {
  MachineASTSchema,
  OSLViewSchema,
  RenderASTSchema,
  type MachineAST,
  type OSLView,
  type RenderAST
} from '../src/schemas/index.js';
import { readYamlFile } from '../src/utils/fs.js';
import { validateOrThrow } from '../src/utils/validation.js';

describe('Ontology schemas', () => {
  it('accepts a valid OSL fixture', async () => {
    const fixture = await readYamlFile<unknown>(
      new URL('./fixtures/osl-valid.yaml', import.meta.url)
    );

    const parsed = validateOrThrow(OSLViewSchema, fixture, 'OSL view');

    expectType<OSLView>(parsed);
    expect(parsed.id).toBe('IdeMainView');
    expect(parsed.components[2]?.id).toBe('NodeCard');
  });

  it('rejects an invalid OSL fixture', async () => {
    const fixture = await readYamlFile<unknown>(
      new URL('./fixtures/osl-invalid.yaml', import.meta.url)
    );

    const parsed = OSLViewSchema.safeParse(fixture);

    expect(parsed.success).toBe(false);

    if (parsed.success) {
      return;
    }

    const messages = parsed.error.issues.map((issue) => issue.message).join(' | ');

    expect(messages).toContain('View ID must be PascalCase and alphanumeric');
    expect(messages).toContain('Unrecognized key(s) in object');
  });

  it('accepts a valid Render AST fixture with nested children', async () => {
    const fixture = await readYamlFile<unknown>(
      new URL('./fixtures/render-ast-valid.yaml', import.meta.url)
    );

    const parsed = validateOrThrow(RenderASTSchema, fixture, 'Render AST');

    expectType<RenderAST>(parsed);


  });

  it('rejects an invalid Render AST fixture with missing and unknown fields', async () => {
    const fixture = await readYamlFile<unknown>(
      new URL('./fixtures/render-ast-invalid.yaml', import.meta.url)
    );

    const parsed = RenderASTSchema.safeParse(fixture);

    expect(parsed.success).toBe(false);

    if (parsed.success) {
      return;
    }

    const messages = parsed.error.issues.map((issue) => issue.message).join(' | ');

    expect(messages).toContain('Required');
    expect(messages).toContain('unknownTopLevel');
  });

  it('accepts a machine AST fixture with states, events, guards, and effects', async () => {
    const fixture = await readYamlFile<unknown>(
      new URL('./fixtures/machine-ast-valid.yaml', import.meta.url)
    );

    const parsed = validateOrThrow(MachineASTSchema, fixture, 'Machine AST');

    expectType<MachineAST>(parsed);
    expect(parsed.events.map((event) => event.name)).toEqual([
      'REQUEST_CONFIRMATION',
      'CONFIRM',
      'EDIT'
    ]);
    expect(parsed.guards[0]?.name).toBe('hasWeight');
    expect(parsed.effects[1]?.kind).toBe('io');
  });
});

function expectType<T>(_value: T): void {
  // Type-level assertion helper used by the schema tests.
}
