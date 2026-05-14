import { z } from "zod";

// Schema fixture. Predicted: schema-driven via /src/schemas/. The
// declarative surface is what regeneration must preserve: the
// declared fields, their types, the optional/required boundary, and
// the inferred TS type. Regeneration is free to reorder fields or
// change comment density.

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  active: z.boolean().default(true),
});

export type User = z.infer<typeof UserSchema>;
