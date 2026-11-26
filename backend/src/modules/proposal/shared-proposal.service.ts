import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { BadRequestError, NotFoundError } from "../../core/CustomError.js";
import type {
  CreateCustomerChangeInput,
  CustomerSelectionsInput,
} from "./shared-proposal.schema.js";

function assertAvailableProposal(proposal: {
  id: string;
  status: string;
  validUntil: Date | null;
} | null): asserts proposal is {
  id: string;
  status: string;
  validUntil: Date | null;
} {
  if (
    !proposal ||
    proposal.status !== "SENT" ||
    (proposal.validUntil !== null && proposal.validUntil <= new Date())
  )
    throw new NotFoundError("Proposal link is invalid or unavailable");
}

function sumPrices(items: { totalPrice: Prisma.Decimal }[]) {
  return items.reduce(
    (total, item) => total.plus(item.totalPrice),
    new Prisma.Decimal(0),
  );
}

export async function getSharedProposal(token: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      status: true,
      validUntil: true,
      title: true,
      eventType: true,
      eventDate: true,
      location: true,
      guestCount: true,
      items: {
        select: {
          id: true,
          description: true,
          unitPrice: true,
          quantity: true,
          totalPrice: true,
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
  assertAvailableProposal(proposal);

  const { id: _id, status: _status, items, ...details } = proposal;
  return {
    ...details,
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
      customerSelection: item.customerSelection,
      vendor: {
        name: item.vendor.name,
        categoryName: item.vendor.category.name,
      },
    })),
    total: sumPrices(items),
  };
}

export async function saveCustomerSelections(
  token: string,
  data: CustomerSelectionsInput,
) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({
      where: { shareToken: token },
      select: { id: true, status: true, validUntil: true },
    });
    assertAvailableProposal(proposal);

    const itemIds = data.selections.map(({ itemId }) => itemId);
    const proposalItems = await tx.proposalItem.findMany({
      where: { proposalId: proposal.id, id: { in: itemIds } },
      select: { id: true },
    });
    if (proposalItems.length !== itemIds.length)
      throw new BadRequestError(
        "One or more selected items do not belong to this proposal",
      );

    await Promise.all(
      data.selections.map(({ itemId, selection }) =>
        tx.proposalItem.update({
          where: { id: itemId },
          data: { customerSelection: selection },
        }),
      ),
    );

    const updatedItems = await tx.proposalItem.findMany({
      where: { proposalId: proposal.id },
      select: { id: true, customerSelection: true, totalPrice: true },
    });
    return {
      selections: updatedItems.map(({ id, customerSelection }) => ({
        itemId: id,
        selection: customerSelection,
      })),
      total: sumPrices(updatedItems),
    };
  });
}

export async function createCustomerChangeRequest(
  token: string,
  data: CreateCustomerChangeInput,
) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({
      where: { shareToken: token },
      select: { id: true, status: true, validUntil: true },
    });
    assertAvailableProposal(proposal);

    if (data.proposalItemId) {
      const item = await tx.proposalItem.findFirst({
        where: { id: data.proposalItemId, proposalId: proposal.id },
        select: { id: true },
      });
      if (!item)
        throw new BadRequestError(
          "Proposal item does not belong to this proposal",
        );
    }

    const changeRequest = await tx.changeRequest.create({
      data: {
        proposalId: proposal.id,
        message: data.message,
        proposalItemId: data.proposalItemId,
      },
      select: {
        id: true,
        proposalItemId: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { changeRequest };
  });
}
