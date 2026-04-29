import { z } from 'zod';

import { NonEmptyStringSchema, VersionSchema } from './common.js';

export const DomainFieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'object',
  'array'
]);

export const DomainFieldSchema = z
  .object({
    name: NonEmptyStringSchema,
    type: DomainFieldTypeSchema,
    required: z.boolean(),
    unit: NonEmptyStringSchema.optional(),
    description: NonEmptyStringSchema.optional(),
    enumValues: z.array(NonEmptyStringSchema).min(1).optional()
  })
  .strict()
  .superRefine((field, context) => {
    if (field.type === 'enum' && field.enumValues === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enumValues'],
        message: 'Enum fields must define enumValues'
      });
    }

    if (field.type !== 'enum' && field.enumValues !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enumValues'],
        message: 'enumValues are only valid when type is "enum"'
      });
    }
  });

export const DomainRelationKindSchema = z.enum([
  'oneToOne',
  'oneToMany',
  'manyToOne',
  'manyToMany'
]);

export const DomainRelationSchema = z
  .object({
    name: NonEmptyStringSchema,
    targetEntity: NonEmptyStringSchema,
    kind: DomainRelationKindSchema,
    description: NonEmptyStringSchema.optional()
  })
  .strict();

export const DomainConstraintSchema = z
  .object({
    id: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    expression: NonEmptyStringSchema
  })
  .strict();

export const DomainEntitySchema = z
  .object({
    id: NonEmptyStringSchema,
    version: VersionSchema,
    name: NonEmptyStringSchema,
    fields: z.array(DomainFieldSchema).min(1, 'At least one field is required'),
    relations: z.array(DomainRelationSchema),
    constraints: z.array(DomainConstraintSchema),
    requiredFields: z.array(NonEmptyStringSchema)
  })
  .strict()
  .superRefine((entity, context) => {
    const fieldNames = new Map<string, boolean>();

    for (const [index, field] of entity.fields.entries()) {
      if (fieldNames.has(field.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields', index, 'name'],
          message: `Duplicate field name "${field.name}" is not allowed`
        });
        continue;
      }

      fieldNames.set(field.name, field.required);
    }

    const requiredFieldNames = new Set<string>();

    for (const [index, requiredField] of entity.requiredFields.entries()) {
      if (requiredFieldNames.has(requiredField)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredFields', index],
          message: `Duplicate required field "${requiredField}" is not allowed`
        });
      }

      requiredFieldNames.add(requiredField);

      if (!fieldNames.has(requiredField)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredFields', index],
          message: `Required field "${requiredField}" is not defined in fields`
        });
      }
    }

    for (const [fieldName, isRequired] of fieldNames.entries()) {
      if (isRequired && !requiredFieldNames.has(fieldName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredFields'],
          message: `Field "${fieldName}" is marked required and must appear in requiredFields`
        });
      }

      if (!isRequired && requiredFieldNames.has(fieldName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requiredFields'],
          message: `Field "${fieldName}" appears in requiredFields but is not marked required`
        });
      }
    }
  });

export type DomainConstraint = z.infer<typeof DomainConstraintSchema>;
export type DomainEntity = z.infer<typeof DomainEntitySchema>;
export type DomainField = z.infer<typeof DomainFieldSchema>;
export type DomainFieldType = z.infer<typeof DomainFieldTypeSchema>;
export type DomainRelation = z.infer<typeof DomainRelationSchema>;
export type DomainRelationKind = z.infer<typeof DomainRelationKindSchema>;
