export class OntologyRuntimeError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.details = options.details;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class OntologyContextError extends OntologyRuntimeError {
  constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class OntologyTopologyError extends OntologyRuntimeError {
  constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class OntologyBranchError extends OntologyRuntimeError {
  constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class OntologyInvariantError extends OntologyRuntimeError {
  constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}
