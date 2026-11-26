import { z } from "zod";
import { BadRequestError } from "../core/CustomError.js";

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

export const PhoneSchema = z
  .string()
  .trim()
  .min(5)
  .max(32)
  .regex(/^\+?[\d\s().-]+$/)
  .refine((value) => /\d/.test(value), "Phone number must contain digits");

export const PasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(72, "Password must not exceed bcrypt's 72-character limit")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must not exceed bcrypt's 72-byte limit",
  });

export function validationError(
  issues: { path: PropertyKey[]; message: string }[],
): BadRequestError {
  return new BadRequestError(
    "Invalid request data",
    issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}
