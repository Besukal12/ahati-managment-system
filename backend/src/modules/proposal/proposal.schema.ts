import { z } from "zod";

const DateTimeSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) =>
    new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value),
  );
const EventDateToSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) =>
    new Date(
      value.length === 10 ? `${value}T23:59:59.999Z` : value,
    ),
  );
const OptionalDateTimeSchema = DateTimeSchema.nullable().optional();
const DecimalInputSchema = z
  .union([
    z.number().finite().transform((value) => String(value)),
    z.string().trim(),
  ])
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,10}(?:\.\d{1,2})?$/,
        "Must be a non-negative amount with up to 2 decimal places",
      ),
  );
const OptionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const GuestCountSchema = z.number().int().min(1).max(2_147_483_647);

export const CreateProposalSchema = z
  .object({
    customerId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    eventType: OptionalText(100),
    eventDate: OptionalDateTimeSchema,
    location: OptionalText(255),
    guestCount: GuestCountSchema.nullable().optional(),
    budget: DecimalInputSchema.nullable().optional(),
    notes: OptionalText(5_000),
    validUntil: OptionalDateTimeSchema,
  })
  .strict();

export const UpdateProposalSchema = z
  .object({
    customerId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    eventType: OptionalText(100),
    eventDate: OptionalDateTimeSchema,
    location: OptionalText(255),
    guestCount: GuestCountSchema.nullable().optional(),
    budget: DecimalInputSchema.nullable().optional(),
    notes: OptionalText(5_000),
    status: z
      .enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"])
      .optional(),
    validUntil: OptionalDateTimeSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const CreateProposalItemSchema = z
  .object({
    vendorId: z.uuid(),
    pricingTypeId: z.uuid(),
    description: OptionalText(2_000),
    unitPrice: DecimalInputSchema,
    quantity: DecimalInputSchema.optional(),
  })
  .strict();

export const UpdateProposalItemSchema = z
  .object({
    pricingTypeId: z.uuid().optional(),
    description: OptionalText(2_000),
    unitPrice: DecimalInputSchema.optional(),
    quantity: DecimalInputSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const ProposalIdSchema = z.uuid();
export const ProposalItemIdSchema = z.uuid();

export const ProposalQuerySchema = z
  .object({
    customerId: z.uuid().optional(),
    status: z
      .enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"])
      .optional(),
    eventDateFrom: DateTimeSchema.optional(),
    eventDateTo: EventDateToSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z
      .enum(["title", "eventDate", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    ({ eventDateFrom, eventDateTo }) =>
      !eventDateFrom || !eventDateTo || eventDateFrom <= eventDateTo,
    {
      path: ["eventDateTo"],
      message: "Event date start must not be after event date end",
    },
  );

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type UpdateProposalInput = z.infer<typeof UpdateProposalSchema>;
export type CreateProposalItemInput = z.infer<typeof CreateProposalItemSchema>;
export type UpdateProposalItemInput = z.infer<typeof UpdateProposalItemSchema>;
export type ProposalQuery = z.infer<typeof ProposalQuerySchema>;
