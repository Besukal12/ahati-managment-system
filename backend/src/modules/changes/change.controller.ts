import type { Request, Response } from "express";
import { BadRequestError } from "../../core/CustomError.js";
import { validationError } from "../../lib/validation.js";
import {
  ChangeRequestIdSchema,
  ReviewChangeRequestSchema,
} from "../proposal/shared-proposal.schema.js";
import { reviewChangeRequest } from "../proposal/review.service.js";

function parseId(value: unknown): string {
  const parsed = ChangeRequestIdSchema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestError("Invalid change request ID");
  return parsed.data;
}

export async function ReviewChangeRequestHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = ReviewChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res
    .status(200)
    .json(await reviewChangeRequest(parseId(req.params.id), parsed.data));
}
