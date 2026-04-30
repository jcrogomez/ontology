import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCliProgram } from '../src/cli/program.js';
import * as fsUtils from '../src/utils/fs.js';
import * as fsPromises from 'node:fs/promises';

vi.mock('../src/utils/fs.js', () => ({
  pathExists: vi.fn(),
  readYamlFile: vi.fn()
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn()
}));

vi.mock('@clack/prompts', () => ({
  log: {
    error: vi.fn(),
    success: vi.fn()
  },
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() })
}));

describe('onto prompt', () => {
  let output = '';

  const getProgram = () => {
    output = '';
    const program = createCliProgram({
      version: '0.1.0-test',
      getCwd: () => '/mock/cwd',
      write: (text) => { output += text; }
    });
    program.exitOverride();
    program.configureOutput({
      writeOut: (text) => { output += text; },
      writeErr: (text) => { output += text; }
    });
    return program;
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fails if graph.json does not exist', async () => {
    vi.mocked(fsUtils.pathExists).mockResolvedValue(false);

    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Prompt graph not found. Run `onto init` first.');
  });

  it('fails if invalid level is provided', async () => {
    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'invalid_level', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Invalid level: invalid_level. Must be one of: project, canon, domain, task, view, component');
  });

  it('fails if graph is empty', async () => {
    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue('   '); // empty content

    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Prompt graph is empty. Run `onto init` first.');
  });

  it('fails if HEAD is missing from graph and no parent provided', async () => {
    const mockGraph = {
      version: '1.0.0',
      projectName: 'my-project',
      nodes: {},
      head: null
    };

    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockGraph));

    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Prompt graph has no HEAD. Run `onto init` or create a root prompt first.');
  });

  it('fails if HEAD points to a missing node', async () => {
    const mockGraph = {
      version: '1.0.0',
      projectName: 'my-project',
      nodes: {},
      head: 'missing-id'
    };

    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockGraph));

    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Prompt graph HEAD points to a missing node.');
  });

  it('fails if explicit parent points to a missing node', async () => {
    const mockGraph = {
      version: '1.0.0',
      projectName: 'my-project',
      nodes: {
        'head-id': {
          id: 'head-id',
          parentId: null,
          hierarchyLevel: 'project',
          promptText: 'init',
          artifacts: {},
          diagnostics: [],
          status: 'clean',
          createdAt: '2026-04-30T00:00:00.000Z',
          author: 'developer'
        }
      },
      head: 'head-id'
    };

    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockGraph));

    const program = getProgram();

    await expect(
      program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', '--parent', 'missing-parent-id', 'Create a view'])
    ).rejects.toThrow();

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.error).toHaveBeenCalledWith('Parent node missing-parent-id not found in graph.');
  });

  it('creates child node from head', async () => {
    const mockGraph = {
      version: '1.0.0',
      projectName: 'my-project',
      nodes: {
        'head-id': {
          id: 'head-id',
          parentId: null,
          hierarchyLevel: 'project',
          promptText: 'init',
          artifacts: {},
          diagnostics: [],
          status: 'clean',
          createdAt: '2026-04-30T00:00:00.000Z',
          author: 'developer'
        }
      },
      head: 'head-id'
    };

    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockGraph));

    const program = getProgram();

    await program.parseAsync(['node', 'onto', 'prompt', '--level', 'view', 'Create a view']);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = vi.mocked(fsPromises.writeFile).mock.calls[0]!;
    expect(writeCall[0]).toContain('graph.json');

    const savedGraph = JSON.parse(writeCall[1] as string);
    const newHeadId = savedGraph.head;
    expect(newHeadId).not.toBe('head-id');

    const newNode = savedGraph.nodes[newHeadId];
    expect(newNode.parentId).toBe('head-id');
    expect(newNode.hierarchyLevel).toBe('view');
    expect(newNode.promptText).toBe('Create a view');
    expect(newNode.author).toBe('developer');

    const mockLog = (await import('@clack/prompts')).log;
    expect(mockLog.success).toHaveBeenCalledWith(expect.stringContaining(`Created prompt node ${newHeadId} at level view`));
    expect(output).toContain(newHeadId);
  });

  it('creates child node from explicit parent', async () => {
    const mockGraph = {
      version: '1.0.0',
      projectName: 'my-project',
      nodes: {
        'root-id': {
          id: 'root-id',
          parentId: null,
          hierarchyLevel: 'project',
          promptText: 'init',
          artifacts: {},
          diagnostics: [],
          status: 'clean',
          createdAt: '2026-04-30T00:00:00.000Z',
          author: 'developer'
        },
        'head-id': {
          id: 'head-id',
          parentId: 'root-id',
          hierarchyLevel: 'canon',
          promptText: 'canon rules',
          artifacts: {},
          diagnostics: [],
          status: 'clean',
          createdAt: '2026-04-30T00:00:00.000Z',
          author: 'developer'
        }
      },
      head: 'head-id'
    };

    vi.mocked(fsUtils.pathExists).mockResolvedValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockGraph));

    const program = getProgram();

    await program.parseAsync(['node', 'onto', 'prompt', '--level', 'domain', '--parent', 'root-id', 'Create domain entity']);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = vi.mocked(fsPromises.writeFile).mock.calls[0]!;
    const savedGraph = JSON.parse(writeCall[1] as string);
    const newHeadId = savedGraph.head;

    const newNode = savedGraph.nodes[newHeadId];
    expect(newNode.parentId).toBe('root-id');
    expect(newNode.hierarchyLevel).toBe('domain');
    expect(newNode.promptText).toBe('Create domain entity');

    expect(output).toContain(newHeadId);
  });
});
