import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  CategoryIdSchema,
  CategoryQuerySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} from "./category.schema.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "./category.service.js";

function parseId(value: unknown) {
  const parsed = CategoryIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestError("Invalid category ID");
  return parsed.data;
}

export async function ListCategoriesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CategoryQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json(await listCategories(parsed.data));
}

export async function CreateCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateCategorySchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(201).json({ category: await createCategory(parsed.data) });
}

export async function GetCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json({ category: await getCategory(parseId(req.params.id)) });
}

export async function UpdateCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = UpdateCategorySchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    category: await updateCategory(parseId(req.params.id), parsed.data),
  });
}

export async function DeleteCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  await deleteCategory(parseId(req.params.id));
  res.status(204).end();
}
