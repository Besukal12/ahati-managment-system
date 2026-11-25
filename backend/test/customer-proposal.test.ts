import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { createAccessToken } from "../src/lib/token.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000010";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000020";
const FIXED_VENDOR_ID = "00000000-0000-4000-8000-000000000030";
const GUEST_VENDOR_ID = "00000000-0000-4000-8000-000000000031";
const QUANTITY_VENDOR_ID = "00000000-0000-4000-8000-000000000032";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000040";
const FIXED_TYPE_ID = "00000000-0000-4000-8000-000000000050";
const GUEST_TYPE_ID = "00000000-0000-4000-8000-000000000051";
const QUANTITY_TYPE_ID = "00000000-0000-4000-8000-000000000052";

const mockState = vi.hoisted(() => ({
  customers: [] as Array<Record<string, any>>,
  proposals: [] as Array<Record<string, any>>,
  vendors: [] as Array<Record<string, any>>,
  categories: [] as Array<Record<string, any>>,
  pricingTypes: [] as Array<Record<string, any>>,
  items: [] as Array<Record<string, any>>,
  nextId: 100,
}));

vi.mock("../src/config/prisma.js", () => {
  const prisma: any = {};
  const prismaError = (code: string) => Object.assign(new Error(), { code });
  const defined = (data: Record<string, any>) =>
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
  const findById = (
    records: Array<Record<string, any>>,
    id: string | undefined,
  ) => records.find((record) => record.id === id);
  const customerCount = (customerId: string) =>
    mockState.proposals.filter((item) => item.customerId === customerId).length;
  const vendorDetail = (vendor: Record<string, any>) => ({
    ...vendor,
    category: findById(mockState.categories, vendor.categoryId),
  });
  const itemDetail = (
    item: Record<string, any>,
    includeVendor = true,
    includePricingType = true,
  ) => ({
    ...item,
    ...(includeVendor
      ? { vendor: vendorDetail(findById(mockState.vendors, item.vendorId)!) }
      : {}),
    ...(includePricingType
      ? { pricingType: findById(mockState.pricingTypes, item.pricingTypeId) }
      : {}),
  });
  const proposalDetail = (
    proposal: Record<string, any>,
    include: Record<string, any> = {},
  ) => {
    const result: Record<string, any> = { ...proposal };
    if (include.customer)
      result.customer = findById(mockState.customers, proposal.customerId);
    if (include.items) {
      const items = mockState.items.filter(
        (item) => item.proposalId === proposal.id,
      );
      if (include.items.select)
        result.items = items.map((item) => ({
          totalPrice: item.totalPrice,
        }));
      else if (include.items.include?.pricingType)
        result.items = items.map((item) =>
          itemDetail(item, false, true),
        );
      else
        result.items = items.map((item) => itemDetail(item));
    }
    return result;
  };
  const nextId = () =>
    `00000000-0000-4000-8000-${String(mockState.nextId++).padStart(12, "0")}`;

  prisma.user = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ADMIN_ID ? { id: ADMIN_ID, isActive: true } : null,
    ),
  };
  prisma.customer = {
    findMany: vi.fn(async ({ where, skip, take, orderBy }: any) => {
      const [sortKey, sortOrder] = Object.entries(orderBy)[0] as [
        string,
        string,
      ];
      return mockState.customers
        .filter((customer) =>
          where.OR
            ? where.OR.some((condition: any) => {
                const [field, filter] = Object.entries(condition)[0] as [
                  string,
                  any,
                ];
                return String(customer[field])
                  .toLowerCase()
                  .includes(String(filter.contains).toLowerCase());
              })
            : true,
        )
        .sort((a, b) => {
          const compare = String(a[sortKey]).localeCompare(String(b[sortKey]));
          return sortOrder === "asc" ? compare : -compare;
        })
        .slice(skip, skip + take)
        .map((customer) => ({
          ...customer,
          _count: { proposals: customerCount(customer.id) },
        }));
    }),
    count: vi.fn(async ({ where }: any) =>
      mockState.customers.filter((customer) =>
        where.OR
          ? where.OR.some((condition: any) => {
              const [field, filter] = Object.entries(condition)[0] as [
                string,
                any,
              ];
              return String(customer[field])
                .toLowerCase()
                .includes(String(filter.contains).toLowerCase());
            })
          : true,
      ).length,
    ),
    findUnique: vi.fn(async ({ where }: any) => {
      const customer = findById(mockState.customers, where.id);
      if (!customer) return null;
      return {
        ...customer,
        _count: { proposals: customerCount(customer.id) },
      };
    }),
    create: vi.fn(async ({ data }: any) => {
      const customer = {
        id: nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defined(data),
      };
      mockState.customers.push(customer);
      return {
        ...customer,
        _count: { proposals: customerCount(customer.id) },
      };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const customer = findById(mockState.customers, where.id);
      if (!customer) throw prismaError("P2025");
      Object.assign(customer, defined(data), { updatedAt: new Date() });
      return {
        ...customer,
        _count: { proposals: customerCount(customer.id) },
      };
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockState.customers.findIndex(
        (customer) => customer.id === where.id,
      );
      if (index < 0) throw prismaError("P2025");
      if (customerCount(where.id) > 0) throw prismaError("P2003");
      return mockState.customers.splice(index, 1)[0];
    }),
  };
  prisma.vendor = {
    findUnique: vi.fn(async ({ where }: any) =>
      findById(mockState.vendors, where.id) ?? null,
    ),
  };
  prisma.category = {
    findUnique: vi.fn(async ({ where }: any) =>
      findById(mockState.categories, where.id) ?? null,
    ),
  };
  prisma.pricingType = {
    findUnique: vi.fn(async ({ where }: any) =>
      findById(mockState.pricingTypes, where.id) ?? null,
    ),
  };
  prisma.proposal = {
    findMany: vi.fn(async ({ where, skip, take, orderBy, include }: any) => {
      const [sortKey, sortOrder] = Object.entries(orderBy)[0] as [
        string,
        string,
      ];
      return mockState.proposals
        .filter((proposal) =>
          where.customerId ? proposal.customerId === where.customerId : true,
        )
        .filter((proposal) =>
          where.status ? proposal.status === where.status : true,
        )
        .filter((proposal) => {
          if (!where.eventDate) return true;
          if (!proposal.eventDate) return false;
          return (
            (!where.eventDate.gte ||
              proposal.eventDate >= where.eventDate.gte) &&
            (!where.eventDate.lte ||
              proposal.eventDate <= where.eventDate.lte)
          );
        })
        .sort((a, b) => {
          const aValue = a[sortKey] ?? "";
          const bValue = b[sortKey] ?? "";
          const compare =
            aValue instanceof Date && bValue instanceof Date
              ? aValue.getTime() - bValue.getTime()
              : String(aValue).localeCompare(String(bValue));
          return sortOrder === "asc" ? compare : -compare;
        })
        .slice(skip, skip + take)
        .map((proposal) => proposalDetail(proposal, include));
    }),
    count: vi.fn(async ({ where }: any) =>
      mockState.proposals.filter((proposal) =>
        (where.customerId === undefined ||
          proposal.customerId === where.customerId) &&
        (where.status === undefined || proposal.status === where.status) &&
        (!where.eventDate ||
          (!!proposal.eventDate &&
            (!where.eventDate.gte ||
              proposal.eventDate >= where.eventDate.gte) &&
            (!where.eventDate.lte ||
              proposal.eventDate <= where.eventDate.lte))),
      ).length,
    ),
    findUnique: vi.fn(async ({ where, include, select }: any) => {
      const proposal = findById(mockState.proposals, where.id);
      if (!proposal) return null;
      if (select)
        return Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key] === true)
            .map((key) => [key, proposal[key]]),
        );
      return proposalDetail(proposal, include);
    }),
    create: vi.fn(async ({ data, include }: any) => {
      const proposal = {
        id: nextId(),
        status: "DRAFT",
        guestCount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defined(data),
      };
      mockState.proposals.push(proposal);
      return proposalDetail(proposal, include);
    }),
    update: vi.fn(async ({ where, data, include }: any) => {
      const proposal = findById(mockState.proposals, where.id);
      if (
        !proposal ||
        (where.status && proposal.status !== where.status)
      )
        throw prismaError("P2025");
      Object.assign(proposal, defined(data), { updatedAt: new Date() });
      return proposalDetail(proposal, include);
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockState.proposals.findIndex(
        (proposal) => proposal.id === where.id,
      );
      if (index < 0) throw prismaError("P2025");
      const [proposal] = mockState.proposals.splice(index, 1);
      mockState.items = mockState.items.filter(
        (item) => item.proposalId !== proposal.id,
      );
      return proposal;
    }),
  };
  prisma.proposalItem = {
    findFirst: vi.fn(async ({ where, include, select }: any) => {
      const item = mockState.items.find(
        (candidate) =>
          (where.id === undefined || candidate.id === where.id) &&
          (where.proposalId === undefined ||
            candidate.proposalId === where.proposalId) &&
          (where.vendorId === undefined ||
            candidate.vendorId === where.vendorId),
      );
      if (!item) return null;
      if (select)
        return Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key] === true)
            .map((key) => [key, item[key]]),
        );
      const result = itemDetail(
        item,
        false,
        Boolean(include?.pricingType),
      );
      if (include?.proposal) {
        const proposal = findById(mockState.proposals, item.proposalId)!;
        result.proposal = {
          status: proposal.status,
          guestCount: proposal.guestCount,
        };
      }
      return result;
    }),
    findMany: vi.fn(async ({ where, select }: any) =>
      mockState.items
        .filter((item) => item.proposalId === where.proposalId)
        .filter((item) =>
          where.pricingType?.calculationMethod
            ? findById(mockState.pricingTypes, item.pricingTypeId)
                ?.calculationMethod ===
              where.pricingType.calculationMethod
            : true,
        )
        .map((item) =>
          select ? { totalPrice: item.totalPrice } : itemDetail(item),
        ),
    ),
    create: vi.fn(async ({ data, include }: any) => {
      if (
        mockState.items.some(
          (item) =>
            item.proposalId === data.proposalId &&
            item.vendorId === data.vendorId,
        )
      )
        throw prismaError("P2002");
      const item = {
        id: nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defined(data),
      };
      mockState.items.push(item);
      return itemDetail(
        item,
        Boolean(include?.vendor),
        Boolean(include?.pricingType),
      );
    }),
    update: vi.fn(async ({ where, data, include }: any) => {
      const item = findById(mockState.items, where.id);
      if (!item) throw prismaError("P2025");
      Object.assign(item, defined(data), { updatedAt: new Date() });
      return itemDetail(
        item,
        Boolean(include?.vendor),
        Boolean(include?.pricingType),
      );
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockState.items.findIndex((item) => item.id === where.id);
      if (index < 0) throw prismaError("P2025");
      return mockState.items.splice(index, 1)[0];
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
  mockState.customers.length = 0;
  mockState.proposals.length = 0;
  mockState.vendors.length = 0;
  mockState.categories.length = 0;
  mockState.pricingTypes.length = 0;
  mockState.items.length = 0;
  mockState.nextId = 100;
});

describe("customer API", () => {
  it("authenticates, validates, searches, paginates, updates, and safely deletes customers", async () => {
    expect((await request(app).get("/api/customers")).status).toBe(401);
    const invalid = await request(app)
      .post("/api/customers")
      .set(auth())
      .send({ fullName: " ", phone: "x", email: "bad" });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post("/api/customers")
      .set(auth())
      .send({
        fullName: "  Hana Bekele ",
        phone: " +251 911 234 567 ",
        email: " HANA@example.com ",
        notes: "  Initial inquiry ",
      });
    expect(created.status).toBe(201);
    expect(created.body.customer).toMatchObject({
      fullName: "Hana Bekele",
      phone: "+251 911 234 567",
      email: "hana@example.com",
      notes: "Initial inquiry",
      _count: { proposals: 0 },
    });

    const listed = await request(app)
      .get("/api/customers?search=hana&page=1&limit=1&sortBy=fullName")
      .set(auth());
    expect(listed.body.customers).toHaveLength(1);
    expect(listed.body.pagination.total).toBe(1);

    const fetched = await request(app)
      .get(`/api/customers/${created.body.customer.id}`)
      .set(auth());
    expect(fetched.body.customer.fullName).toBe("Hana Bekele");
    const updated = await request(app)
      .patch(`/api/customers/${created.body.customer.id}`)
      .set(auth())
      .send({ fullName: "Hana T. Bekele" });
    expect(updated.body.customer.fullName).toBe("Hana T. Bekele");

    const deleted = await request(app)
      .delete(`/api/customers/${created.body.customer.id}`)
      .set(auth());
    expect(deleted.status).toBe(204);
  });
});

describe("proposal API", () => {
  beforeEach(() => {
    mockState.customers.push({
      id: CUSTOMER_ID,
      fullName: "Hana Bekele",
      phone: "+251 911 234 567",
      email: "hana@example.com",
    });
  });

  it("validates ownership, status transitions, proposal totals, and draft-only edits/deletes", async () => {
    expect((await request(app).get("/api/proposals")).status).toBe(401);
    const missingCustomer = await request(app)
      .post("/api/proposals")
      .set(auth())
      .send({ customerId: FIXED_VENDOR_ID, title: "Wedding" });
    expect(missingCustomer.status).toBe(404);

    const created = await request(app)
      .post("/api/proposals")
      .set(auth())
      .send({
        customerId: CUSTOMER_ID,
        title: "  Hana's wedding ",
        eventDate: "2027-06-08",
        guestCount: 120,
        budget: "5000.00",
      });
    expect(created.status).toBe(201);
    expect(created.body.proposal.title).toBe("Hana's wedding");
    expect(amount(created.body.proposal.total)).toBe("0.00");
    const unsafeCustomerDelete = await request(app)
      .delete(`/api/customers/${CUSTOMER_ID}`)
      .set(auth());
    expect(unsafeCustomerDelete.status).toBe(409);

    const updated = await request(app)
      .patch(`/api/proposals/${created.body.proposal.id}`)
      .set(auth())
      .send({ title: "Updated wedding", notes: "Draft" });
    expect(updated.body.proposal.title).toBe("Updated wedding");

    const sent = await request(app)
      .patch(`/api/proposals/${created.body.proposal.id}`)
      .set(auth())
      .send({ status: "SENT" });
    expect(sent.body.proposal.status).toBe("SENT");
    const invalidTransition = await request(app)
      .patch(`/api/proposals/${created.body.proposal.id}`)
      .set(auth())
      .send({ status: "DRAFT" });
    expect(invalidTransition.status).toBe(400);
    const forbiddenEdit = await request(app)
      .patch(`/api/proposals/${created.body.proposal.id}`)
      .set(auth())
      .send({ title: "Too late" });
    expect(forbiddenEdit.status).toBe(409);
    const forbiddenDelete = await request(app)
      .delete(`/api/proposals/${created.body.proposal.id}`)
      .set(auth());
    expect(forbiddenDelete.status).toBe(409);

    const filtered = await request(app)
      .get(
        `/api/proposals?customerId=${CUSTOMER_ID}&status=SENT&eventDateFrom=2027-06-01&eventDateTo=2027-06-30`,
      )
      .set(auth());
    expect(filtered.body.proposals).toHaveLength(1);
    expect(filtered.body.proposals[0].total).toBe("0");
    expect(filtered.body.pagination.total).toBe(1);

    const draft = await request(app)
      .post("/api/proposals")
      .set(auth())
      .send({ customerId: CUSTOMER_ID, title: "Discarded draft" });
    const deletedDraft = await request(app)
      .delete(`/api/proposals/${draft.body.proposal.id}`)
      .set(auth());
    expect(deletedDraft.status).toBe(204);
    const missingProposal = await request(app)
      .get("/api/proposals/00000000-0000-4000-8000-000000000099")
      .set(auth());
    expect(missingProposal.status).toBe(404);
  });

  it("calculates every pricing method with Decimal, snapshots vendor prices, and recalculates guest totals", async () => {
    mockState.categories.push({ id: CATEGORY_ID, name: "Florals" });
    mockState.vendors.push(
      {
        id: FIXED_VENDOR_ID,
        name: "Bloom",
        categoryId: CATEGORY_ID,
        isActive: true,
        priceMin: new Prisma.Decimal("100.00"),
        priceMax: new Prisma.Decimal("150.00"),
        priceUnit: "package",
        priceNotes: "Original terms",
      },
      {
        id: GUEST_VENDOR_ID,
        name: "Caterer",
        categoryId: CATEGORY_ID,
        isActive: true,
        priceMin: new Prisma.Decimal("20.00"),
        priceMax: new Prisma.Decimal("35.00"),
        priceUnit: "guest",
        priceNotes: "Per guest",
      },
      {
        id: QUANTITY_VENDOR_ID,
        name: "Lighting",
        categoryId: CATEGORY_ID,
        isActive: true,
        priceMin: new Prisma.Decimal("5.00"),
        priceMax: new Prisma.Decimal("10.00"),
        priceUnit: "piece",
        priceNotes: null,
      },
    );
    mockState.pricingTypes.push(
      {
        id: FIXED_TYPE_ID,
        name: "Fixed",
        calculationMethod: "FIXED",
        isActive: true,
      },
      {
        id: GUEST_TYPE_ID,
        name: "Per guest",
        calculationMethod: "EVENT_GUESTS",
        isActive: true,
      },
      {
        id: QUANTITY_TYPE_ID,
        name: "Quantity",
        calculationMethod: "QUANTITY",
        isActive: true,
      },
    );

    const proposalResponse = await request(app)
      .post("/api/proposals")
      .set(auth())
      .send({
        customerId: CUSTOMER_ID,
        title: "Price calculations",
        guestCount: 3,
      });
    const proposalId = proposalResponse.body.proposal.id;

    const fixedResponse = await request(app)
      .post(`/api/proposals/${proposalId}/items`)
      .set(auth())
      .send({
        vendorId: FIXED_VENDOR_ID,
        pricingTypeId: FIXED_TYPE_ID,
        unitPrice: "10.50",
      });
    expect(fixedResponse.status).toBe(201);
    expect(amount(fixedResponse.body.item.totalPrice)).toBe("10.50");
    expect(amount(fixedResponse.body.item.quantity)).toBe("1.00");
    expect(amount(fixedResponse.body.item.vendorPriceMinSnapshot)).toBe(
      "100.00",
    );

    const duplicate = await request(app)
      .post(`/api/proposals/${proposalId}/items`)
      .set(auth())
      .send({
        vendorId: FIXED_VENDOR_ID,
        pricingTypeId: FIXED_TYPE_ID,
        unitPrice: "10.50",
      });
    expect(duplicate.status).toBe(409);

    const eventItem = await request(app)
      .post(`/api/proposals/${proposalId}/items`)
      .set(auth())
      .send({
        vendorId: GUEST_VENDOR_ID,
        pricingTypeId: GUEST_TYPE_ID,
        unitPrice: "2.25",
      });
    expect(amount(eventItem.body.item.totalPrice)).toBe("6.75");

    const quantityItem = await request(app)
      .post(`/api/proposals/${proposalId}/items`)
      .set(auth())
      .send({
        vendorId: QUANTITY_VENDOR_ID,
        pricingTypeId: QUANTITY_TYPE_ID,
        unitPrice: "5.20",
        quantity: "2.50",
      });
    expect(amount(quantityItem.body.item.totalPrice)).toBe("13.00");

    const fixedId = fixedResponse.body.item.id;
    const updatedFixed = await request(app)
      .patch(`/api/proposals/${proposalId}/items/${fixedId}`)
      .set(auth())
      .send({ unitPrice: "11.00", totalPrice: 1 });
    expect(updatedFixed.status).toBe(400);
    const validFixedUpdate = await request(app)
      .patch(`/api/proposals/${proposalId}/items/${fixedId}`)
      .set(auth())
      .send({ unitPrice: "11.00" });
    expect(amount(validFixedUpdate.body.item.totalPrice)).toBe("11.00");
    expect(amount(validFixedUpdate.body.item.vendorPriceMinSnapshot)).toBe(
      "100.00",
    );

    const vendor = mockState.vendors.find(
      (item) => item.id === FIXED_VENDOR_ID,
    )!;
    vendor.priceMin = new Prisma.Decimal("900.00");
    vendor.priceNotes = "Changed after proposal creation";
    const detail = await request(app)
      .get(`/api/proposals/${proposalId}`)
      .set(auth());
    expect(amount(detail.body.proposal.items[0].vendorPriceMinSnapshot)).toBe(
      "100.00",
    );
    expect(detail.body.proposal.total).toBe("30.75");

    const guestUpdate = await request(app)
      .patch(`/api/proposals/${proposalId}`)
      .set(auth())
      .send({ guestCount: 5 });
    expect(guestUpdate.status).toBe(200);
    expect(
      amount(
        guestUpdate.body.proposal.items.find(
          (item: any) => item.vendorId === GUEST_VENDOR_ID,
        ).totalPrice,
      ),
    ).toBe("11.25");
    expect(guestUpdate.body.proposal.total).toBe("35.25");

    const removeResponse = await request(app)
      .delete(`/api/proposals/${proposalId}/items/${fixedId}`)
      .set(auth());
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.proposalTotal).toBe("24.25");

    const missingGuests = await request(app)
      .patch(`/api/proposals/${proposalId}`)
      .set(auth())
      .send({ guestCount: null });
    expect(missingGuests.status).toBe(400);
  });
});
