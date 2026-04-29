import { packageJsonSchema } from '../schemas/package-json.js';
import { readUtf8File } from '../utils/fs.js';

const packageJsonUrl = new URL('../../package.json', import.meta.url);

export async function resolveCliVersion(): Promise<string> {
  const packageJsonContents = await readUtf8File(packageJsonUrl);
  const parsedPackageJson = packageJsonSchema.safeParse(
    JSON.parse(packageJsonContents)
  );

  if (!parsedPackageJson.success) {
    throw new Error(
      `Failed to resolve the onto CLI version from package.json: ${parsedPackageJson.error.message}`
    );
  }

  return parsedPackageJson.data.version;
}
