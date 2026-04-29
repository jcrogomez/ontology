import { z } from 'zod';

export interface JsonSchema {
  $defs?: Record<string, JsonSchema>;
  $ref?: string;
  $schema?: string;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  const?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
}

interface JsonSchemaConversionContext {
  definitions: Record<string, JsonSchema>;
  seen: Map<z.ZodTypeAny, string>;
}

export function toJsonSchema(
  schema: z.ZodTypeAny,
  name = 'RootSchema'
): JsonSchema {
  const context: JsonSchemaConversionContext = {
    definitions: {},
    seen: new Map()
  };

  const rootSchema = convertSchema(schema, context, name);
  const hasDefinitions = Object.keys(context.definitions).length > 0;

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...rootSchema,
    ...(hasDefinitions ? { $defs: context.definitions } : {})
  };
}

function convertSchema(
  schema: z.ZodTypeAny,
  context: JsonSchemaConversionContext,
  nameHint: string
): JsonSchema {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return convertSchema(schema._def.innerType, context, nameHint);
  }

  if (schema instanceof z.ZodNullable) {
    return {
      anyOf: [
        convertSchema(schema.unwrap(), context, nameHint),
        {
          type: 'null'
        }
      ]
    };
  }

  if (schema instanceof z.ZodEffects) {
    return convertSchema(schema.innerType(), context, nameHint);
  }

  if (schema instanceof z.ZodLazy) {
    const existingName = context.seen.get(schema);

    if (existingName !== undefined) {
      return {
        $ref: `#/$defs/${existingName}`
      };
    }

    const definitionName = createDefinitionName(nameHint, context);
    context.seen.set(schema, definitionName);
    context.definitions[definitionName] = {};
    context.definitions[definitionName] = convertSchema(
      schema._def.getter(),
      context,
      definitionName
    );

    return {
      $ref: `#/$defs/${definitionName}`
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertSchema(value, context, `${nameHint}${key}`);

      if (!value.isOptional()) {
        required.push(key);
      }
    }

    const additionalProperties = schema._def.unknownKeys !== 'strict';

    return {
      type: 'object',
      properties,
      required,
      additionalProperties
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: convertSchema(
        schema._def.valueType as z.ZodTypeAny,
        context,
        `${nameHint}Value`
      )
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: convertSchema(schema.element, context, `${nameHint}Item`)
    };
  }

  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options as z.ZodTypeAny[];

    return {
      anyOf: options.map((option, index) =>
        convertSchema(option, context, `${nameHint}Option${index + 1}`)
      )
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema.options
    };
  }

  if (schema instanceof z.ZodLiteral) {
    return {
      const: schema._def.value
    };
  }

  if (schema instanceof z.ZodString) {
    return {
      type: 'string'
    };
  }

  if (schema instanceof z.ZodNumber) {
    return {
      type: 'number'
    };
  }

  if (schema instanceof z.ZodBoolean) {
    return {
      type: 'boolean'
    };
  }

  if (schema instanceof z.ZodNull) {
    return {
      type: 'null'
    };
  }

  throw new Error(
    `Unsupported Zod schema type for JSON schema conversion: ${schema._def.typeName}`
  );
}

function createDefinitionName(
  nameHint: string,
  context: JsonSchemaConversionContext
): string {
  const sanitizedHint = nameHint.replace(/[^A-Za-z0-9_]/g, '') || 'Schema';

  if (!Object.hasOwn(context.definitions, sanitizedHint)) {
    return sanitizedHint;
  }

  let suffix = 2;

  while (Object.hasOwn(context.definitions, `${sanitizedHint}${suffix}`)) {
    suffix += 1;
  }

  return `${sanitizedHint}${suffix}`;
}
