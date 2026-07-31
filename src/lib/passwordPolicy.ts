import { z } from "zod";

// One password rule for the whole system, matching the strength the office is
// already used to from the PHP tracker ("8+ characters, with letters, numbers,
// and symbols"). Previously each route enforced a bare min(8) of its own, so
// the three places a password can be set could drift apart.
//
// Applies only where a password is being *set* (create / reset / change), never
// on sign-in — existing accounts keep working with whatever they have until
// someone changes it.

export const PASSWORD_RULE_TEXT = "At least 8 characters, including a letter, a number, and a symbol.";

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include a letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol (for example ! @ #).";
  return null;
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
