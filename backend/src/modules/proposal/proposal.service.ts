import { prisma } from "../../config/prisma.js";
import {
  Prisma,
  type CalculationMethod,
  type ProposalStatus,
} from "../../generated/prisma/client.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../core/CustomError.js";
import { hasPrismaCode } from "../../lib/prismaErrors.js";
import type {
  CreateProposalInput,
  CreateProposalItemInput,
  ProposalQuery,
  UpdateProposalInput,
  UpdateProposalItemInput,
} from "./proposal.schema.js";

const proposalDetails = {
  customer: {
    select: { id: true, fullName: true, phone: true, email: true },
  },
  items: {
    include: {
      vendor: { include: { category: true } },
      pricingType: true,
    },
  },
} satisfies Prisma.ProposalInclude;

const proposalListInclude = {
  customer: {
    select: { id: true, fullName: true, phone: true, email: true },
  },
  items: { select: { totalPrice: true } },
} satisfies Prisma.ProposalInclude;

function sumItems(items: { totalPrice: Prisma.Decimal }[]): Prisma.Decimal {
  return items.reduce(
    (total, item) => total.plus(item.totalPrice),
    new Prisma.Decimal(0),
  );
}

function calculateTotal(amount: Prisma.Decimal): Prisma.Decimal {
  const total = amount.toDecimalPlaces(2);
  if (total.greaterThan("9999999999.99"))
    throw new BadRequestError(
      "Calculated item total exceeds the supported maximum",
    );
  return total;
}

async function getProposalTotal(
  tx: Prisma.TransactionClient,
  proposalId: string,
): Promise<Prisma.Decimal> {
  const items = await tx.proposalItem.findMany({
    where: { proposalId },
    select: { totalPrice: true },
  });
  return sumItems(items);
}

function withTotal<T extends { items: { totalPrice: Prisma.Decimal }[] }>(
  proposal: T,
) {
  return { ...proposal, total: sumItems(proposal.items) };
}

function proposalCreateData(
  data: CreateProposalInput,
): Prisma.ProposalUncheckedCreateInput {
  return {
    ...data,
    budget:
      data.budget == null ? data.budget : new Prisma.Decimal(data.budget),
  };
}

function proposalUpdateData(
  data: UpdateProposalInput,
): Prisma.ProposalUncheckedUpdateInput {
  return {
    ...data,
    budget:
      data.budget === undefined
        ? undefined
        : data.budget === null
          ? null
          : new Prisma.Decimal(data.budget),
  };
}

const allowedStatusTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ["DRAFT", "SENT"],
  SENT: ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["ACCEPTED"],
  REJECTED: ["REJECTED"],
  EXPIRED: ["EXPIRED"],
};

function assertDraft(status: ProposalStatus): void {
  if (status !== "DRAFT")
    throw new ConflictError("Only draft proposals can be edited");
}

function assertStatusTransition(
  current: ProposalStatus,
  next: ProposalStatus,
): void {
  if (!allowedStatusTransitions[current].includes(next))
    throw new BadRequestError(
      `Proposal status cannot change from ${current} to ${next}`,
    );
}

function calculateItemPricing(
  method: CalculationMethod,
  unitPrice: Prisma.Decimal,
  quantityInput: string | undefined,
  guestCount: number | null,
): { quantity: Prisma.Decimal; totalPrice: Prisma.Decimal } {
  const one = new Prisma.Decimal(1);
  if (method === "FIXED") {
    if (quantityInput !== undefined && !new Prisma.Decimal(quantityInput).eq(1))
      throw new BadRequestError("Fixed-price items must have quantity one");
    return { quantity: one, totalPrice: calculateTotal(unitPrice) };
  }

  if (method === "EVENT_GUESTS") {
    if (guestCount === null || guestCount < 1)
      throw new BadRequestError(
        "A valid proposal guest count is required for this pricing type",
      );
    if (quantityInput !== undefined && !new Prisma.Decimal(quantityInput).eq(1))
      throw new BadRequestError("Event-guest items must have quantity one");
    return {
      quantity: one,
      totalPrice: calculateTotal(unitPrice.mul(guestCount)),
    };
  }

  if (quantityInput === undefined)
    throw new BadRequestError("Quantity is required for this pricing type");
  const quantity = new Prisma.Decimal(quantityInput);
  return { quantity, totalPrice: calculateTotal(unitPrice.mul(quantity)) };
}

export async function listProposals(query: ProposalQuery) {
  const where = {
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.eventDateFrom || query.eventDateTo
      ? {
          eventDate: {
            ...(query.eventDateFrom ? { gte: query.eventDateFrom } : {}),
            ...(query.eventDateTo ? { lte: query.eventDateTo } : {}),
          },
        }
      : {}),
  };
  const [proposals, total] = await Promise.all([
    prisma.proposal.findMany({
      where,
      include: proposalListInclude,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.proposal.count({ where }),
  ]);
  return {
    proposals: proposals.map((proposal) => {
      const { items, ...fields } = proposal;
      return {
        ...fields,
        total: sumItems(items),
        itemCount: items.length,
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getProposal(id: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: proposalDetails,
  });
  if (!proposal) throw new NotFoundError("Proposal not found");
  return withTotal(proposal);
}

export async function createProposal(data: CreateProposalInput) {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");

  try {
    const proposal = await prisma.proposal.create({
      data: proposalCreateData(data),
      include: proposalDetails,
    });
    return withTotal(proposal);
  } catch (error) {
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Customer not found");
    throw error;
  }
}

export async function updateProposal(id: string, data: UpdateProposalInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.proposal.findUnique({
        where: { id },
        include: {
          items: { include: { pricingType: true } },
        },
      });
      if (!current) throw new NotFoundError("Proposal not found");

      const suppliedFields = Object.keys(data).filter(
        (field) => field !== "status",
      );
      if (current.status !== "DRAFT" && suppliedFields.length > 0)
        throw new ConflictError("Only draft proposals can be edited");
      if (data.status) assertStatusTransition(current.status, data.status);

      if (data.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: data.customerId },
          select: { id: true },
        });
        if (!customer) throw new NotFoundError("Customer not found");
      }

      const nextGuestCount =
        data.guestCount === undefined ? current.guestCount : data.guestCount;
      const guestCountChanged =
        data.guestCount !== undefined &&
        data.guestCount !== current.guestCount;
      if (guestCountChanged) {
        const guestPricedItems = current.items.filter(
          (item) => item.pricingType.calculationMethod === "EVENT_GUESTS",
        );
        if (guestPricedItems.length > 0 && (nextGuestCount ?? 0) < 1)
          throw new BadRequestError(
            "A valid guest count is required while event-guest items exist",
          );
      }

      const proposal = await tx.proposal.update({
        where: { id, status: current.status },
        data: proposalUpdateData(data),
        include: proposalDetails,
      });

      if (guestCountChanged && nextGuestCount !== null) {
        const guestPricedItems = current.items.filter(
          (item) => item.pricingType.calculationMethod === "EVENT_GUESTS",
        );
        await Promise.all(
          guestPricedItems.map((item) =>
            tx.proposalItem.update({
              where: { id: item.id },
              data: {
                totalPrice: calculateTotal(
                  item.unitPrice.mul(nextGuestCount),
                ),
              },
            }),
          ),
        );
      }

      const updated = await tx.proposal.findUnique({
        where: { id: proposal.id },
        include: proposalDetails,
      });
      if (!updated) throw new NotFoundError("Proposal not found");
      return withTotal(updated);
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new ConflictError("Proposal was changed by another request");
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Customer not found");
    throw error;
  }
}

export async function deleteProposal(id: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!proposal) throw new NotFoundError("Proposal not found");
      assertDraft(proposal.status);
      await tx.proposal.delete({ where: { id } });
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025"))
      throw new NotFoundError("Proposal not found");
    throw error;
  }
}

export async function addProposalItem(
  proposalId: string,
  data: CreateProposalItemInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id: proposalId },
        select: { id: true, status: true, guestCount: true },
      });
      if (!proposal) throw new NotFoundError("Proposal not found");
      assertDraft(proposal.status);

      const [vendor, pricingType, existing] = await Promise.all([
        tx.vendor.findUnique({
          where: { id: data.vendorId },
          select: {
            id: true,
            isActive: true,
            priceMin: true,
            priceMax: true,
            priceUnit: true,
            priceNotes: true,
          },
        }),
        tx.pricingType.findUnique({ where: { id: data.pricingTypeId } }),
        tx.proposalItem.findFirst({
          where: { proposalId, vendorId: data.vendorId },
          select: { id: true },
        }),
      ]);
      if (!vendor) throw new NotFoundError("Vendor not found");
      if (!vendor.isActive)
        throw new BadRequestError("Inactive vendors cannot be added");
      if (!pricingType) throw new NotFoundError("Pricing type not found");
      if (!pricingType.isActive)
        throw new BadRequestError("Pricing type is inactive");
      if (existing)
        throw new ConflictError("Vendor is already on this proposal");

      const unitPrice = new Prisma.Decimal(data.unitPrice);
      const pricing = calculateItemPricing(
        pricingType.calculationMethod,
        unitPrice,
        data.quantity,
        proposal.guestCount,
      );
      const item = await tx.proposalItem.create({
        data: {
          proposalId,
          vendorId: vendor.id,
          pricingTypeId: pricingType.id,
          description: data.description,
          unitPrice,
          quantity: pricing.quantity,
          totalPrice: pricing.totalPrice,
          vendorPriceMinSnapshot: vendor.priceMin,
          vendorPriceMaxSnapshot: vendor.priceMax,
          vendorPriceUnitSnapshot: vendor.priceUnit,
          vendorPriceNotesSnapshot: vendor.priceNotes,
        },
        include: {
          vendor: { include: { category: true } },
          pricingType: true,
        },
      });
      return {
        item,
        proposalTotal: await getProposalTotal(tx, proposalId),
      };
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002"))
      throw new ConflictError("Vendor is already on this proposal");
    if (hasPrismaCode(error, "P2003"))
      throw new NotFoundError("Vendor, proposal, or pricing type not found");
    throw error;
  }
}

export async function updateProposalItem(
  proposalId: string,
  itemId: string,
  data: UpdateProposalItemInput,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.proposalItem.findFirst({
      where: { id: itemId, proposalId },
      include: {
        proposal: { select: { status: true, guestCount: true } },
        pricingType: true,
      },
    });
    if (!item) throw new NotFoundError("Proposal item not found");
    assertDraft(item.proposal.status);

    let pricingType = item.pricingType;
    if (data.pricingTypeId) {
      const nextType = await tx.pricingType.findUnique({
        where: { id: data.pricingTypeId },
      });
      if (!nextType) throw new NotFoundError("Pricing type not found");
      if (!nextType.isActive)
        throw new BadRequestError("Pricing type is inactive");
      pricingType = nextType;
    }

    const unitPrice =
      data.unitPrice === undefined
        ? item.unitPrice
        : new Prisma.Decimal(data.unitPrice);
    const quantityInput =
      data.quantity === undefined
        ? item.quantity.toString()
        : data.quantity;
    const pricing = calculateItemPricing(
      pricingType.calculationMethod,
      unitPrice,
      quantityInput,
      item.proposal.guestCount,
    );
    const updated = await tx.proposalItem.update({
      where: { id: item.id },
      data: {
        ...(data.pricingTypeId ? { pricingTypeId: data.pricingTypeId } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        unitPrice,
        quantity: pricing.quantity,
        totalPrice: pricing.totalPrice,
      },
      include: {
        vendor: { include: { category: true } },
        pricingType: true,
      },
    });
    return {
      item: updated,
      proposalTotal: await getProposalTotal(tx, proposalId),
    };
  });
}

export async function removeProposalItem(
  proposalId: string,
  itemId: string,
): Promise<{ proposalTotal: Prisma.Decimal }> {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, status: true },
    });
    if (!proposal) throw new NotFoundError("Proposal not found");
    assertDraft(proposal.status);

    const item = await tx.proposalItem.findFirst({
      where: { id: itemId, proposalId },
      select: { id: true },
    });
    if (!item) throw new NotFoundError("Proposal item not found");
    await tx.proposalItem.delete({ where: { id: item.id } });
    return { proposalTotal: await getProposalTotal(tx, proposalId) };
  });
}
