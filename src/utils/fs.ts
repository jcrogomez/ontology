import { access, readFile, writeFile } from 'node:fs/promises';

import { parse, stringify } from 'yaml';

export async function writeUtf8File(
  path: string | URL,
  content: string
): Promise<void> {
  await writeFile(path, content, 'utf8');
}

export async function readUtf8File(path: string | URL): Promise<string> {
  return readFile(path, 'utf8');
}

export async function readYamlFile<T>(path: string | URL): Promise<T> {
  const contents = await readUtf8File(path);
  return parse(contents) as T;
}

export async function writeYamlFile(
  path: string | URL,
  value: unknown
): Promise<void> {
  await writeFile(path, stringify(value), 'utf8');
}

export async function pathExists(path: string | URL): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
