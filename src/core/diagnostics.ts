import { z } from 'zod';

export const DiagnosticSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'blocking'
]);

export const DiagnosticSchema = z.object({
  severity: DiagnosticSeveritySchema,
  code: z.string(),
  message: z.string(),
  path: z.array(z.string()),
  suggestion: z.string().optional()
});

export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
