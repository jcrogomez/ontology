import { z } from 'zod';

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export const NonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, 'Expected a non-empty string');

export const VersionSchema = NonEmptyStringSchema;
export const TargetSchema = NonEmptyStringSchema;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema)
  ])
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(JsonValueSchema);
