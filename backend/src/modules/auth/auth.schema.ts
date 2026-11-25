import { z } from "zod";
import { EmailSchema, PasswordSchema } from "../../lib/validation.js";

export const BootstrapAdminSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();

export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(72),
  })
  .strict();

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: PasswordSchema,
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

export type BootstrapAdminInput = z.infer<typeof BootstrapAdminSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
