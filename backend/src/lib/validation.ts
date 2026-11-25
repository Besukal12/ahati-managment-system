import { z } from "zod";

export const EmailSchema = z.email().trim().toLowerCase().max(254);

export const PasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(72, "Password must not exceed bcrypt's 72-character limit")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must not exceed bcrypt's 72-byte limit",
  });
