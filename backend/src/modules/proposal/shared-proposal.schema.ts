import { z } from "zod";

export const ShareTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{20,128}$/);

export const CustomerSelectionsSchema = z
  .object({
    selections: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            selection: z.enum(["SELECTED", "NOT_SELECTED"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(({ selections }, context) => {
    const itemIds = new Set<string>();
    for (const [index, selection] of selections.entries()) {
      if (itemIds.has(selection.itemId))
        context.addIssue({
          code: "custom",
          path: ["selections", index, "itemId"],
          message: "Duplicate proposal item",
        });
      itemIds.add(selection.itemId);
    }
  });

export const CreateCustomerChangeSchema = z
  .object({
    message: z.string().trim().min(1).max(3_000),
    proposalItemId: z.uuid().optional(),
  })
  .strict();

export const ReviewChangeRequestSchema = z
  .object({
    status: z
      .enum(["OPEN", "REVIEWED", "RESOLVED", "DECLINED"])
      .optional(),
    response: z.string().trim().min(1).max(3_000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const ChangeRequestIdSchema = z.uuid();

export type CustomerSelectionsInput = z.infer<
  typeof CustomerSelectionsSchema
>;
export type CreateCustomerChangeInput = z.infer<
  typeof CreateCustomerChangeSchema
>;
export type ReviewChangeRequestInput = z.infer<
  typeof ReviewChangeRequestSchema
>;
