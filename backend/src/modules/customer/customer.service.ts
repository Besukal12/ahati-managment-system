import { prisma } from "../../config/prisma.js";
import {
  ConflictError,
  NotFoundError,
} from "../../core/CustomError.js";
import { hasPrismaCode } from "../../lib/prismaErrors.js";
import type {
  CreateCustomerInput,
  CustomerQuery,
  UpdateCustomerInput,
} from "./customer.schema.js";

export async function listCustomers(query: CustomerQuery) {
  const where = query.search
    ? {
        OR: [
          { fullName: { contains: query.search, mode: "insensitive" as const } },
          { phone: { contains: query.search } },
        ],
      }
    : {};
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { proposals: true } } },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.customer.count({ where }),
  ]);
  return {
    customers,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { proposals: true } } },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

export async function createCustomer(data: CreateCustomerInput) {
  return prisma.customer.create({
    data,
    include: { _count: { select: { proposals: true } } },
  });
}

export async function updateCustomer(id: string, data: UpdateCustomerInput) {
  try {
    return await prisma.customer.update({
      where: { id },
      data,
      include: { _count: { select: { proposals: true } } },
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Customer not found");
    throw error;
  }
}

export async function deleteCustomer(id: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, _count: { select: { proposals: true } } },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  if (customer._count.proposals > 0)
    throw new ConflictError("Customer cannot be deleted while proposals exist");

  try {
    await prisma.customer.delete({ where: { id } });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Customer not found");
    if (hasPrismaCode(error, "P2003"))
      throw new ConflictError(
        "Customer cannot be deleted while proposals exist",
      );
    throw error;
  }
}
