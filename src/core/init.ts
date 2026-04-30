import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { pathExists, writeYamlFile, writeUtf8File } from '../utils/fs.js';
import { createSeedFiles, createTextSeedFiles, INIT_DIRECTORY_PATHS, INIT_NEXT_STEPS } from './init-seeds.js';

export interface InitOntologyProjectOptions {
  cwd: string;
  projectName?: string;
}

export interface InitOntologyProjectResult {
  nextSteps: readonly string[];
  projectRoot: string;
}

export async function initOntologyProject(
  options: InitOntologyProjectOptions
): Promise<InitOntologyProjectResult> {
  const projectRoot = resolveProjectRoot(options.cwd, options.projectName);
  const inferredProjectName = basename(projectRoot);

  await mkdir(projectRoot, { recursive: true });
  await createDirectories(projectRoot);
  await writeSeedFiles(projectRoot, inferredProjectName);

  return {
    projectRoot,
    nextSteps: INIT_NEXT_STEPS
  };
}

function resolveProjectRoot(cwd: string, projectName?: string): string {
  if (projectName === undefined) {
    return cwd;
  }

  return resolve(cwd, projectName);
}

async function createDirectories(projectRoot: string): Promise<void> {
  for (const relativePath of INIT_DIRECTORY_PATHS) {
    await mkdir(join(projectRoot, relativePath), { recursive: true });
  }
}

async function writeSeedFiles(
  projectRoot: string,
  projectName: string
): Promise<void> {
  for (const seedFile of createSeedFiles(projectName)) {
    const absolutePath = join(projectRoot, seedFile.path);

    if (await pathExists(absolutePath)) {
      throw new Error(
        `Ontology init aborted because "${seedFile.path}" already exists.`
      );
    }

    await writeYamlFile(absolutePath, seedFile.value);
  }

  for (const seedFile of createTextSeedFiles()) {
    const absolutePath = join(projectRoot, seedFile.path);

    if (await pathExists(absolutePath)) {
      throw new Error(
        `Ontology init aborted because "${seedFile.path}" already exists.`
      );
    }

    await writeUtf8File(absolutePath, seedFile.content);
  }
}
