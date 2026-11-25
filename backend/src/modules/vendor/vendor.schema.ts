import { z } from "zod";
import { EmailSchema, PhoneSchema } from "../../lib/validation.js";

const VendorNameSchema = z.string().trim().min(1).max(160);
const OptionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const PhotoSchema = z.url().max(2048);
const PriceSchema = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
    "Price can have no more than 2 decimal places",
  );

export const CreateVendorSchema = z
  .object({
    name: VendorNameSchema,
    categoryId: z.uuid(),
    description: OptionalText(5_000),
    contactName: OptionalText(160),
    phone: PhoneSchema.nullable().optional(),
    email: EmailSchema.nullable().optional(),
    social: OptionalText(500),
    photos: z.array(PhotoSchema).default([]),
    priceMin: PriceSchema.nullable().optional(),
    priceMax: PriceSchema.nullable().optional(),
    priceUnit: OptionalText(100),
    priceNotes: OptionalText(2_000),
  })
  .strict()
  .refine(
    ({ priceMin, priceMax }) =>
      priceMin == null || priceMax == null || priceMin <= priceMax,
    {
      path: ["priceMax"],
      message: "Minimum price must not exceed maximum price",
    },
  );

export const UpdateVendorSchema = z
  .object({
    name: VendorNameSchema.optional(),
    categoryId: z.uuid().optional(),
    description: OptionalText(5_000),
    contactName: OptionalText(160),
    phone: PhoneSchema.nullable().optional(),
    email: EmailSchema.nullable().optional(),
    social: OptionalText(500),
    photos: z.array(PhotoSchema).optional(),
    priceMin: PriceSchema.nullable().optional(),
    priceMax: PriceSchema.nullable().optional(),
    priceUnit: OptionalText(100),
    priceNotes: OptionalText(2_000),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(
    ({ priceMin, priceMax }) =>
      priceMin == null || priceMax == null || priceMin <= priceMax,
    {
      path: ["priceMax"],
      message: "Minimum price must not exceed maximum price",
    },
  );

export const VendorIdSchema = z.uuid();

export const VendorStatusSchema = z
  .object({ isActive: z.boolean() })
  .strict();

export const VendorQuerySchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    categoryId: z.uuid().optional(),
    status: z.enum(["active", "inactive", "all"]).default("active"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z
      .enum(["name", "priceMin", "priceMax", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
export type VendorQuery = z.infer<typeof VendorQuerySchema>;