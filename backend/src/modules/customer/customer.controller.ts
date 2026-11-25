import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  CreateCustomerSchema,
  CustomerIdSchema,
  CustomerQuerySchema,
  UpdateCustomerSchema,
} from "./customer.schema.js";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "./customer.service.js";

function parseId(value: unknown): string {
  const parsed = CustomerIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestError("Invalid customer ID");
  return parsed.data;
}

export async function ListCustomersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CustomerQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json(await listCustomers(parsed.data));
}

export async function CreateCustomerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateCustomerSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(201).json({ customer: await createCustomer(parsed.data) });
}

export async function GetCustomerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json({ customer: await getCustomer(parseId(req.params.id)) });
}

export async function UpdateCustomerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = UpdateCustomerSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    customer: await updateCustomer(parseId(req.params.id), parsed.data),
  });
}

export async function DeleteCustomerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  await deleteCustomer(parseId(req.params.id));
  res.status(204).end();
}
