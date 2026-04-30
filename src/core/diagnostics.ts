export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'blocking';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path: string[];
  suggestion?: string;
}
