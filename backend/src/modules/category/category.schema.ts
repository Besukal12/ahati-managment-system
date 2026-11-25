import { z } from "zod";

const CategoryNameSchema = z.string().trim().min(1).max(120);

export const CreateCategorySchema = z
  .object({ name: CategoryNameSchema })
  .strict();

export const UpdateCategorySchema = z
  .object({ name: CategoryNameSchema })
  .strict();

export const CategoryIdSchema = z.uuid();

export const CategoryQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CategoryQuery = z.infer<typeof CategoryQuerySchema>;
