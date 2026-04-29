import { z } from 'zod';

import {
  JsonObjectSchema,
  NonEmptyStringSchema
} from './common.js';

export const MachineEventSchema = z
  .object({
    name: NonEmptyStringSchema,
    description: NonEmptyStringSchema.optional(),
    payload: JsonObjectSchema.optional()
  })
  .strict();

export const MachineGuardSchema = z
  .object({
    name: NonEmptyStringSchema,
    description: NonEmptyStringSchema.optional(),
    condition: NonEmptyStringSchema.optional(),
    params: JsonObjectSchema.optional()
  })
  .strict();

export const MachineEffectKindSchema = z.enum([
  'assignment',
  'notification',
  'io',
  'analytics',
  'other'
]);

export const MachineEffectSchema = z
  .object({
    name: NonEmptyStringSchema,
    description: NonEmptyStringSchema.optional(),
    kind: MachineEffectKindSchema.optional(),
    params: JsonObjectSchema.optional()
  })
  .strict();

export const MachineTransitionSchema = z
  .object({
    target: NonEmptyStringSchema,
    guard: NonEmptyStringSchema.optional(),
    effects: z.array(NonEmptyStringSchema).optional(),
    description: NonEmptyStringSchema.optional()
  })
  .strict();

export interface MachineState {
  description?: string | undefined;
  entry?: string[] | undefined;
  exit?: string[] | undefined;
  initial?: string | undefined;
  on?: Record<string, MachineTransition | MachineTransition[]> | undefined;
  states?: Record<string, MachineState> | undefined;
  type?: 'atomic' | 'compound' | 'parallel' | 'final' | undefined;
}

export interface MachineTransition {
  description?: string | undefined;
  effects?: string[] | undefined;
  guard?: string | undefined;
  target: string;
}

const MachineTransitionSetSchema = z.union([
  MachineTransitionSchema,
  z.array(MachineTransitionSchema).min(1)
]);

export const MachineStateSchema: z.ZodType<MachineState> = z.lazy(() =>
  z
    .object({
      description: NonEmptyStringSchema.optional(),
      type: z.enum(['atomic', 'compound', 'parallel', 'final']).optional(),
      initial: NonEmptyStringSchema.optional(),
      entry: z.array(NonEmptyStringSchema).optional(),
      exit: z.array(NonEmptyStringSchema).optional(),
      on: z.record(MachineTransitionSetSchema).optional(),
      states: z.record(MachineStateSchema).optional()
    })
    .strict()
);

export const MachineASTSchema = z
  .object({
    initial: NonEmptyStringSchema,
    context: JsonObjectSchema,
    states: z.record(MachineStateSchema),
    events: z.array(MachineEventSchema),
    guards: z.array(MachineGuardSchema),
    effects: z.array(MachineEffectSchema)
  })
  .strict()
  .superRefine((machine, context) => {
    if (!Object.hasOwn(machine.states, machine.initial)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initial'],
        message: `Initial state "${machine.initial}" must exist in states`
      });
    }
  });

export type MachineAST = z.infer<typeof MachineASTSchema>;
export type MachineEffect = z.infer<typeof MachineEffectSchema>;
export type MachineEffectKind = z.infer<typeof MachineEffectKindSchema>;
export type MachineEvent = z.infer<typeof MachineEventSchema>;
export type MachineGuard = z.infer<typeof MachineGuardSchema>;
