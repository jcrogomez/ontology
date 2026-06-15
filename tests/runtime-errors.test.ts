import { describe, it, expect } from 'vitest';
import {
  OntologyRuntimeError,
  OntologyContextError,
  OntologyTopologyError,
  OntologyBranchError,
  OntologyInvariantError,
} from '../src/kernel/errors.js';

describe('Ontology Runtime Errors', () => {
  const errorClasses = [
    OntologyRuntimeError,
    OntologyContextError,
    OntologyTopologyError,
    OntologyBranchError,
    OntologyInvariantError,
  ];

  it('errors preserve name', () => {
    for (const ErrorClass of errorClasses) {
      const error = new ErrorClass('Test message', { code: 'TEST_CODE' });
      expect(error.name).toBe(ErrorClass.name);
    }
  });

  it('errors preserve code', () => {
    for (const ErrorClass of errorClasses) {
      const error = new ErrorClass('Test message', { code: 'TEST_CODE' });
      expect(error.code).toBe('TEST_CODE');
    }
  });

  it('errors preserve details', () => {
    for (const ErrorClass of errorClasses) {
      const details = { nodeId: 'n1', parentId: 'n2' };
      const error = new ErrorClass('Test message', {
        code: 'TEST_CODE',
        details,
      });
      expect(error.details).toEqual(details);
    }
  });

  it('errors are instanceof Error', () => {
    for (const ErrorClass of errorClasses) {
      const error = new ErrorClass('Test message', { code: 'TEST_CODE' });
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('derived errors are instanceof OntologyRuntimeError', () => {
    const derivedClasses = [
      OntologyContextError,
      OntologyTopologyError,
      OntologyBranchError,
      OntologyInvariantError,
    ];

    for (const ErrorClass of derivedClasses) {
      const error = new ErrorClass('Test message', { code: 'TEST_CODE' });
      expect(error).toBeInstanceOf(OntologyRuntimeError);
    }
  });
});
