import type { Request, Response } from "express";
import { NotFoundError, BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  CreateCustomerChangeSchema,
  CustomerSelectionsSchema,
  ShareTokenSchema,
} from "./shared-proposal.schema.js";
import {
  createCustomerChangeRequest,
  getSharedProposal,
  saveCustomerSelections,
} from "./shared-proposal.service.js";

function parseToken(value: unknown): string {
  const parsed = ShareTokenSchema.safeParse(value);
  if (!parsed.success)
    throw new NotFoundError("Proposal link is invalid or unavailable");
  return parsed.data;
}

export async function GetSharedProposalHandler(
  req: Request,
  res: Response,
): Promise<void> {
  res
    .status(200)
    .json({ proposal: await getSharedProposal(parseToken(req.params.token)) });
}

export async function SaveCustomerSelectionsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CustomerSelectionsSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res
    .status(200)
    .json(
      await saveCustomerSelections(
        parseToken(req.params.token),
        parsed.data,
      ),
    );
}

export async function CreateCustomerChangeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = CreateCustomerChangeSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res
    .status(201)
    .json(
      await createCustomerChangeRequest(
        parseToken(req.params.token),
        parsed.data,
      ),
    );
}
