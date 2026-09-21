import { z } from "zod";

const emailSchema = z.email({ error: "Please enter a valid email." });

export const signupSchema = z.object({
  name: z
    .string({ error: "Name is required." })
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be at most 100 characters long." }),
  email: emailSchema,
  password: z
    .string({ error: "Password is required." })
    .min(8, { error: "Password must be at least 8 characters long." })
    .max(128, { error: "Password must be at most 128 characters long." })
    .regex(/[A-Za-z]/, { error: "Password must contain at least one letter." })
    .regex(/[0-9]/, { error: "Password must contain at least one number." }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Password is required." })
    .min(1, { error: "Password is required." }),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
