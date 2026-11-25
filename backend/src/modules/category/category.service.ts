import { prisma } from "../../config/prisma.js";
import {
  ConflictError,
  NotFoundError,
} from "../../core/CustomError.js";
import { hasPrismaCode } from "../../lib/prismaErrors.js";
import type {
  CategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.schema.js";

export async function listCategories(query: CategoryQuery) {
  const where = query.search
    ? { name: { contains: query.search, mode: "insensitive" as const } }
    : {};
  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { _count: { select: { vendors: true } } },
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.category.count({ where }),
  ]);
  return {
    categories,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { vendors: true } } },
  });
  if (!category) throw new NotFoundError("Category not found");
  return category;
}

export async function createCategory(data: CreateCategoryInput) {
  try {
    return await prisma.category.create({ data });
  } catch (error) {
    if (hasPrismaCode(error, "P2002"))
      throw new ConflictError("A category with this name already exists");
    throw error;
  }
}

export async function updateCategory(
  id: string,
  data: UpdateCategoryInput,
) {
  try {
    return await prisma.category.update({ where: { id }, data });
  } catch (error) {
    if (hasPrismaCode(error, "P2002"))
      throw new ConflictError("A category with this name already exists");
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Category not found");
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { vendors: true } } },
  });
  if (!category) throw new NotFoundError("Category not found");
  if (category._count.vendors > 0)
    throw new ConflictError("Category cannot be deleted while it has vendors");

  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Category not found");
    if (hasPrismaCode(error, "P2003"))
      throw new ConflictError("Category cannot be deleted while it has vendors");
    throw error;
  }
}
