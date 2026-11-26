import { z } from "zod";
import { EmailSchema, PhoneSchema } from "../../lib/validation.js";

const FullNameSchema = z.string().trim().min(2).max(160);
const NotesSchema = z.string().trim().max(2_000).nullable().optional();

export const CreateCustomerSchema = z
  .object({
    fullName: FullNameSchema,
    phone: PhoneSchema,
    email: EmailSchema.nullable().optional(),
    notes: NotesSchema,
  })
  .strict();

export const UpdateCustomerSchema = z
  .object({
    fullName: FullNameSchema.optional(),
    phone: PhoneSchema.optional(),
    email: EmailSchema.nullable().optional(),
    notes: NotesSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const CustomerIdSchema = z.uuid();

export const CustomerQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["fullName", "createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
export type CustomerQuery = z.infer<typeof CustomerQuerySchema>;
