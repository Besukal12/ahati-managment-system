import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { createAccessToken } from "../src/lib/token.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000020";
const OTHER_PROPOSAL_ID = "00000000-0000-4000-8000-000000000021";
const ITEM_ID = "00000000-0000-4000-8000-000000000030";
const OTHER_ITEM_ID = "00000000-0000-4000-8000-000000000031";
const VENDOR_ID = "00000000-0000-4000-8000-000000000040";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000050";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000060";

const mockState = vi.hoisted(() => ({
  proposals: [] as Array<Record<string, any>>,
  items: [] as Array<Record<string, any>>,
  vendors: [] as Array<Record<string, any>>,
  categories: [] as Array<Record<string, any>>,
  customers: [] as Array<Record<string, any>>,
  changes: [] as Array<Record<string, any>>,
  nextId: 100,
}));

vi.mock("../src/config/prisma.js", () => {
  const prisma: any = {};
  const prismaError = (code: string) => Object.assign(new Error(), { code });
  const findById = (
    records: Array<Record<string, any>>,
    id: string | undefined,
  ) => records.find((record) => record.id === id);
  const vendorForItem = (item: Record<string, any>) => {
    const vendor = findById(mockState.vendors, item.vendorId)!;
    const category = findById(mockState.categories, vendor.categoryId)!;
    return {
      name: vendor.name,
      category: { name: category.name },
    };
  };
  const projectProposal = (
    proposal: Record<string, any>,
    select: Record<string, any>,
  ) => {
    const result: Record<string, any> = {};
    for (const [key, selection] of Object.entries(select)) {
      if (selection === true) {
        result[key] = proposal[key];
      } else if (key === "items") {
        result.items = mockState.items
          .filter((item) => item.proposalId === proposal.id)
          .map((item) => {
            const projected: Record<string, any> = {};
            for (const [itemKey, itemSelection] of Object.entries(
              selection.select,
            )) {
              if (itemSelection === true) projected[itemKey] = item[itemKey];
              if (itemKey === "vendor")
                projected.vendor = vendorForItem(item);
            }
            return projected;
          });
      }
    }
    return result;
  };
  const projectChange = (change: Record<string, any>) => {
    const item = change.proposalItemId
      ? findById(mockState.items, change.proposalItemId)
      : null;
    return {
      ...change,
      proposalItem: item
        ? {
            id: item.id,
            description: item.description,
            vendor: {
              name: findById(mockState.vendors, item.vendorId)?.name,
            },
          }
        : null,
    };
  };
  const nextId = () =>
    `00000000-0000-4000-8000-${String(mockState.nextId++).padStart(12, "0")}`;

  prisma.user = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ADMIN_ID ? { id: ADMIN_ID, isActive: true } : null,
    ),
  };
  prisma.proposal = {
    findUnique: vi.fn(async ({ where, select }: any) => {
      const proposal =
        mockState.proposals.find(
          (item) =>
            (where.id === undefined || item.id === where.id) &&
            (where.shareToken === undefined ||
              item.shareToken === where.shareToken),
        ) ?? null;
      if (!proposal) return null;
      return select ? projectProposal(proposal, select) : proposal;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const proposal = findById(mockState.proposals, where.id);
      if (
        !proposal ||
        (where.status !== undefined && proposal.status !== where.status)
      )
        throw prismaError("P2025");
      Object.assign(proposal, data);
      return proposal;
    }),
  };
  prisma.proposalItem = {
    findMany: vi.fn(async ({ where, select }: any) =>
      mockState.items
        .filter((item) => item.proposalId === where.proposalId)
        .filter((item) =>
          where.id?.in ? where.id.in.includes(item.id) : true,
        )
        .map((item) =>
          select
            ? Object.fromEntries(
                Object.keys(select)
                  .filter((key) => select[key] === true)
                  .map((key) => [key, item[key]]),
              )
            : item,
        ),
    ),
    findFirst: vi.fn(async ({ where }: any) =>
      mockState.items.find(
        (item) =>
          (where.id === undefined || item.id === where.id) &&
          (where.proposalId === undefined ||
            item.proposalId === where.proposalId),
      ) ?? null,
    ),
    update: vi.fn(async ({ where, data }: any) => {
      const item = findById(mockState.items, where.id);
      if (!item) throw prismaError("P2025");
      Object.assign(item, data);
      return item;
    }),
  };
  prisma.changeRequest = {
    create: vi.fn(async ({ data, select }: any) => {
      const change = {
        id: nextId(),
        status: "OPEN",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      mockState.changes.push(change);
      return select
        ? Object.fromEntries(
            Object.keys(select)
              .filter((key) => select[key] === true)
              .map((key) => [key, change[key]]),
          )
        : change;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      mockState.changes
        .filter((change) => change.proposalId === where.proposalId)
        .sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map(projectChange),
    ),
    findUnique: vi.fn(async ({ where, select }: any) => {
      const change = findById(mockState.changes, where.id);
      if (!change) return null;
      return select
        ? Object.fromEntries(
            Object.keys(select)
              .filter((key) => select[key] === true)
              .map((key) => [key, change[key]]),
          )
        : change;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const change = findById(mockState.changes, where.id);
      if (!change) throw prismaError("P2025");
      Object.assign(change, data, { updatedAt: new Date() });
      return projectChange(change);
    }),
  };
  prisma.$transaction = vi.fn(async (operation: any) =>
    typeof operation === "function" ? operation(prisma) : Promise.all(operation),
  );
  return { prisma };
});

vi.mock("../src/core/Logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));

const auth = () => ({
  authorization: `Bearer ${createAccessToken(ADMIN_ID)}`,
});
const amount = (value: unknown) =>
  new Prisma.Decimal(String(value)).toFixed(2);

beforeEach(() => {
  mockState.proposals.length = 0;
  mockState.items.length = 0;
  mockState.vendors.length = 0;
  mockState.categories.length = 0;
  mockState.customers.length = 0;
  mockState.changes.length = 0;
  mockState.nextId = 100;
  mockState.categories.push({ id: CATEGORY_ID, name: "Venues" });
  mockState.customers.push({
    id: CUSTOMER_ID,
    fullName: "Private Customer",
    email: "private@example.com",
    phone: "+251 911 000 000",
    notes: "Customer-only note",
  });
  mockState.vendors.push({
    id: VENDOR_ID,
    name: "Garden Hall",
    categoryId: CATEGORY_ID,
    email: "vendor-private@example.com",
    phone: "+251 911 111 111",
    priceMin: new Prisma.Decimal("900.00"),
    priceMax: new Prisma.Decimal("1200.00"),
    priceUnit: "day",
    priceNotes: "Internal vendor terms",
  });
  mockState.proposals.push({
    id: PROPOSAL_ID,
    customerId: CUSTOMER_ID,
    title: "Wedding celebration",
    eventType: "Wedding",
    eventDate: new Date("2027-06-08T00:00:00.000Z"),
    location: "Addis Ababa",
    guestCount: 80,
    budget: new Prisma.Decimal("5000.00"),
    notes: "Internal proposal notes",
    status: "SENT",
    validUntil: new Date(Date.now() + 86_400_000),
    shareToken: null,
  });
  mockState.items.push(
    {
      id: ITEM_ID,
      proposalId: PROPOSAL_ID,
      vendorId: VENDOR_ID,
      description: "Garden ceremony venue",
      unitPrice: new Prisma.Decimal("250.00"),
      quantity: new Prisma.Decimal("1.00"),
      totalPrice: new Prisma.Decimal("250.00"),
      vendorPriceMinSnapshot: new Prisma.Decimal("700.00"),
      vendorPriceMaxSnapshot: new Prisma.Decimal("900.00"),
      vendorPriceUnitSnapshot: "day",
      vendorPriceNotesSnapshot: "Old internal price note",
      customerSelection: "PENDING",
    },
    {
      id: OTHER_ITEM_ID,
      proposalId: OTHER_PROPOSAL_ID,
      vendorId: VENDOR_ID,
      description: "Other proposal item",
      unitPrice: new Prisma.Decimal("1.00"),
      quantity: new Prisma.Decimal("1.00"),
      totalPrice: new Prisma.Decimal("1.00"),
      customerSelection: "PENDING",
    },
  );
  mockState.proposals.push({
    id: OTHER_PROPOSAL_ID,
    customerId: CUSTOMER_ID,
    title: "Other proposal",
    status: "SENT",
    validUntil: null,
    shareToken: null,
  });
});

async function createShareLink() {
  const response = await request(app)
    .post(`/api/proposals/${PROPOSAL_ID}/share`)
    .set(auth());
  expect(response.status).toBe(200);
  return response.body as { token: string; url: string };
}

describe("private customer proposal workflow", () => {
  it("shares only sent proposals and returns a privacy-filtered view using saved prices", async () => {
    const invalid = await request(app).get(
      "/api/shared/proposals/not-a-valid-private-token",
    );
    expect(invalid.status).toBe(404);

    const link = await createShareLink();
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(link.url).toContain(`/proposal/${link.token}`);

    mockState.vendors[0].priceMin = new Prisma.Decimal("9999.00");
    const response = await request(app).get(
      `/api/shared/proposals/${link.token}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.proposal).toMatchObject({
      title: "Wedding celebration",
      eventType: "Wedding",
      items: [
        {
          id: ITEM_ID,
          unitPrice: "250",
          totalPrice: "250",
          customerSelection: "PENDING",
          vendor: { name: "Garden Hall", categoryName: "Venues" },
        },
      ],
      total: "250",
    });
    expect(response.body.proposal).not.toHaveProperty("notes");
    expect(response.body.proposal).not.toHaveProperty("budget");
    expect(response.body.proposal).not.toHaveProperty("customerId");
    expect(response.body.proposal).not.toHaveProperty("shareToken");
    expect(response.body.proposal.items[0]).not.toHaveProperty(
      "vendorPriceMinSnapshot",
    );
    expect(response.body.proposal.items[0].vendor).not.toHaveProperty("email");
    expect(amount(response.body.proposal.items[0].unitPrice)).toBe("250.00");
  });

  it("validates selections and change requests against the shared proposal", async () => {
    const link = await createShareLink();

    const invalidSelection = await request(app)
      .post(`/api/shared/proposals/${link.token}/selections`)
      .send({
        selections: [{ itemId: OTHER_ITEM_ID, selection: "SELECTED" }],
      });
    expect(invalidSelection.status).toBe(400);

    const saved = await request(app)
      .post(`/api/shared/proposals/${link.token}/selections`)
      .send({ selections: [{ itemId: ITEM_ID, selection: "SELECTED" }] });
    expect(saved.status).toBe(200);
    expect(saved.body.selections).toEqual([
      { itemId: ITEM_ID, selection: "SELECTED" },
    ]);
    expect(mockState.items[0].customerSelection).toBe("SELECTED");
    expect(amount(saved.body.total)).toBe("250.00");

    const emptyMessage = await request(app)
      .post(`/api/shared/proposals/${link.token}/changes`)
      .send({ message: "  " });
    expect(emptyMessage.status).toBe(400);
    const unrelatedItem = await request(app)
      .post(`/api/shared/proposals/${link.token}/changes`)
      .send({ message: "Please review this", proposalItemId: OTHER_ITEM_ID });
    expect(unrelatedItem.status).toBe(400);

    const created = await request(app)
      .post(`/api/shared/proposals/${link.token}/changes`)
      .send({ message: "Could you clarify the venue setup?", proposalItemId: ITEM_ID });
    expect(created.status).toBe(201);
    expect(created.body.changeRequest).toMatchObject({
      proposalItemId: ITEM_ID,
      message: "Could you clarify the venue setup?",
      status: "OPEN",
    });
  });

  it("allows admin review, enforces admin auth, expires and revokes links", async () => {
    const link = await createShareLink();
    const change = await request(app)
      .post(`/api/shared/proposals/${link.token}/changes`)
      .send({ message: "Please explain the price" });
    const changeId = change.body.changeRequest.id;

    expect(
      (
        await request(app).get(
          `/api/proposals/${PROPOSAL_ID}/selections`,
        )
      ).status,
    ).toBe(401);
    const adminSelections = await request(app)
      .get(`/api/proposals/${PROPOSAL_ID}/selections`)
      .set(auth());
    expect(adminSelections.status).toBe(200);
    expect(adminSelections.body.selections[0]).toMatchObject({
      itemId: ITEM_ID,
      vendorName: "Garden Hall",
      selection: "PENDING",
    });

    const adminChanges = await request(app)
      .get(`/api/proposals/${PROPOSAL_ID}/changes`)
      .set(auth());
    expect(adminChanges.status).toBe(200);
    expect(adminChanges.body.changes).toHaveLength(1);

    const unauthorizedReview = await request(app)
      .patch(`/api/changes/${changeId}`)
      .send({ status: "REVIEWED" });
    expect(unauthorizedReview.status).toBe(401);
    const reviewed = await request(app)
      .patch(`/api/changes/${changeId}`)
      .set(auth())
      .send({ status: "REVIEWED", response: "We will check with the venue." });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.changeRequest).toMatchObject({
      status: "REVIEWED",
      response: "We will check with the venue.",
    });

    mockState.proposals[0].validUntil = new Date(Date.now() - 1_000);
    const expiredView = await request(app).get(
      `/api/shared/proposals/${link.token}`,
    );
    const expiredChange = await request(app)
      .post(`/api/shared/proposals/${link.token}/changes`)
      .send({ message: "This should not be accepted" });
    expect(expiredView.status).toBe(404);
    expect(expiredChange.status).toBe(404);

    mockState.proposals[0].validUntil = new Date(Date.now() + 86_400_000);
    const revoked = await request(app)
      .delete(`/api/proposals/${PROPOSAL_ID}/share`)
      .set(auth());
    expect(revoked.status).toBe(204);
    const revokedView = await request(app).get(
      `/api/shared/proposals/${link.token}`,
    );
    expect(revokedView.status).toBe(404);
  });
});
