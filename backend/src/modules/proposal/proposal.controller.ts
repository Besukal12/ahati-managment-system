import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  CreateProposalItemSchema,
  CreateProposalSchema,
  ProposalIdSchema,
  ProposalItemIdSchema,
  ProposalQuerySchema,
  UpdateProposalItemSchema,
  UpdateProposalSchema,
} from "./proposal.schema.js";
import {
  addProposalItem,
  createProposal,
  deleteProposal,
  getProposal,
  listProposals,
  removeProposalItem,
  updateProposal,
  updateProposalItem,
} from "./proposal.service.js";

function parseId(value: unknown, label: string): string {
  const parsed = ProposalIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestError(`Invalid ${label} ID`);
  return parsed.data;
}

function parseItemId(value: unknown): string {
  const parsed = ProposalItemIdSchema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestError("Invalid proposal item ID");
  return parsed.data;
}

export async function ListProposalsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = ProposalQuerySchema.safeParse(req.query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json(await listProposals(parsed.data));
}

export async function CreateProposalHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateProposalSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(201).json({ proposal: await createProposal(parsed.data) });
}

export async function GetProposalHandler(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json({
    proposal: await getProposal(parseId(req.params.id, "proposal")),
  });
}

export async function UpdateProposalHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = UpdateProposalSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    proposal: await updateProposal(
      parseId(req.params.id, "proposal"),
      parsed.data,
    ),
  });
}

export async function DeleteProposalHandler(
  req: Request,
  res: Response,
): Promise<void> {
  await deleteProposal(parseId(req.params.id, "proposal"));
  res.status(204).end();
}

export async function AddProposalItemHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateProposalItemSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(201).json({
    ...(await addProposalItem(
      parseId(req.params.id, "proposal"),
      parsed.data,
    )),
  });
}

export async function UpdateProposalItemHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = UpdateProposalItemSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.status(200).json({
    ...(await updateProposalItem(
      parseId(req.params.id, "proposal"),
      parseItemId(req.params.itemId),
      parsed.data,
    )),
  });
}

export async function RemoveProposalItemHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await removeProposalItem(
    parseId(req.params.id, "proposal"),
    parseItemId(req.params.itemId),
  );
  res.status(200).json({ message: "Proposal item removed", ...result });
}
