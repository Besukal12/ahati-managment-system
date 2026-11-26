import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  CreateVendorSchema,
  UpdateVendorSchema,
  VendorIdSchema,
  VendorQuerySchema,
  VendorStatusSchema,
} from "./vendor.schema.js";
import {
  createVendor,
  getVendor,
  listVendors,
  updateVendor,
  updateVendorStatus,
} from "./vendor.service.js";

function parseId(value: unknown) {
  const parsed = VendorIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestError("Invalid vendor ID");
  return parsed.data;
}

export async function ListVendorsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = VendorQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json(await listVendors(parsed.data));
}

export async function CreateVendorHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateVendorSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(201).json({ vendor: await createVendor(parsed.data) });
}

export async function GetVendorHandler(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json({ vendor: await getVendor(parseId(req.params.id)) });
}

export async function UpdateVendorHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = UpdateVendorSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    vendor: await updateVendor(parseId(req.params.id), parsed.data),
  });
}

export async function UpdateVendorStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = VendorStatusSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    vendor: await updateVendorStatus(
      parseId(req.params.id),
      parsed.data.isActive,
    ),
  });
}