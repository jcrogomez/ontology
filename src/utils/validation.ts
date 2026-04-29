import { z } from 'zod';

function formatIssuePath(path: (string | number)[]): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : segment
    )
    .join('.')
    .replace('.[', '[');
}

export function validateOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  label: string
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid ${label}: ${details}`);
}
