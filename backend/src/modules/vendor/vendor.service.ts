import { prisma } from "../../config/prisma.js";
import {
  BadRequestError,
  NotFoundError,
} from "../../core/CustomError.js";
import type {
  CreateVendorInput,
  UpdateVendorInput,
  VendorQuery,
} from "./vendor.schema.js";

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function assertPriceRange(
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): void {
  if (priceMin != null && priceMax != null && priceMin > priceMax)
    throw new BadRequestError("Minimum price must not exceed maximum price", [
      {
        field: "priceMax",
        message: "Minimum price must not exceed maximum price",
      },
    ]);
}

export async function listVendors(query: VendorQuery) {
  const where = {
    ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.vendor.count({ where }),
  ]);
  return {
    vendors,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!vendor) throw new NotFoundError("Vendor not found");
  return vendor;
}

export async function createVendor(data: CreateVendorInput) {
  const category = await prisma.category.findUnique({
    where: { id: data.categoryId },
    select: { id: true },
  });
  if (!category) throw new NotFoundError("Category not found");
  assertPriceRange(data.priceMin, data.priceMax);

  try {
    return await prisma.vendor.create({
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Category not found");
    throw error;
  }
}

export async function updateVendor(id: string, data: UpdateVendorInput) {
  const current = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, priceMin: true, priceMax: true },
  });
  if (!current) throw new NotFoundError("Vendor not found");

  if (data.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundError("Category not found");
  }

  const priceMin = data.priceMin === undefined ? current.priceMin : data.priceMin;
  const priceMax = data.priceMax === undefined ? current.priceMax : data.priceMax;
  assertPriceRange(
    priceMin === null ? null : Number(priceMin),
    priceMax === null ? null : Number(priceMax),
  );

  try {
    return await prisma.vendor.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Vendor not found");
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Category not found");
    throw error;
  }
}

export async function updateVendorStatus(id: string, isActive: boolean) {
  try {
    return await prisma.vendor.update({
      where: { id },
      data: { isActive },
      include: { category: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Vendor not found");
    throw error;
  }
}