import { z } from 'zod';

export const packageJsonSchema = z.object({
  version: z.string().min(1, 'package.json version is required')
});
