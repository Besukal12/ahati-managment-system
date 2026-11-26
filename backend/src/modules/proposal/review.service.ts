import { prisma } from "../../config/prisma.js";
import {
  type ChangeRequestStatus,
} from "../../generated/prisma/client.js";
import { BadRequestError, NotFoundError } from "../../core/CustomError.js";
import { hasPrismaCode } from "../../lib/prismaErrors.js";
import type { ReviewChangeRequestInput } from "./shared-proposal.schema.js";

const allowedChangeRequestTransitions: Record<
  ChangeRequestStatus,
  ChangeRequestStatus[]
> = {
  OPEN: ["OPEN", "REVIEWED", "RESOLVED", "DECLINED"],
  REVIEWED: ["REVIEWED", "RESOLVED", "DECLINED"],
  RESOLVED: ["RESOLVED"],
  DECLINED: ["DECLINED"],
};

export async function getProposalSelections(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      title: true,
      items: {
        select: {
          id: true,
          description: true,
          customerSelection: true,
          vendor: {
            select: {
              name: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!proposal) throw new NotFoundError("Proposal not found");
  return {
    proposalId: proposal.id,
    title: proposal.title,
    selections: proposal.items.map((item) => ({
      itemId: item.id,
      description: item.description,
      vendorName: item.vendor.name,
      categoryName: item.vendor.category.name,
      selection: item.customerSelection,
    })),
  };
}

export async function listProposalChangeRequests(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true },
  });
  if (!proposal) throw new NotFoundError("Proposal not found");

  const changes = await prisma.changeRequest.findMany({
    where: { proposalId },
    include: {
      proposalItem: {
        select: {
          id: true,
          description: true,
          vendor: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return { changes };
}

export async function reviewChangeRequest(
  id: string,
  data: ReviewChangeRequestInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.changeRequest.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!current) throw new NotFoundError("Change request not found");

      if (
        data.status &&
        !allowedChangeRequestTransitions[current.status].includes(data.status)
      )
        throw new BadRequestError(
          `Change request status cannot change from ${current.status} to ${data.status}`,
        );

      const changeRequest = await tx.changeRequest.update({
        where: { id },
        data,
        include: {
          proposalItem: {
            select: {
              id: true,
              description: true,
              vendor: { select: { name: true } },
            },
          },
        },
      });
      return { changeRequest };
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Change request not found");
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Proposal item not found");
    throw error;
  }
}
