import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { createAccessToken } from "../src/lib/token.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000002";
const VENDOR_ID = "00000000-0000-4000-8000-000000000003";

const mockState = vi.hoisted(() => ({
  categories: [] as Array<Record<string, any>>,
  vendors: [] as Array<Record<string, any>>,
}));

vi.mock("../src/config/prisma.js", () => {
  const prisma: any = {};
  const prismaError = (code: string) => Object.assign(new Error(), { code });
  const categoryWithCount = (category: Record<string, any>) => ({
    ...category,
    _count: {
      vendors: mockState.vendors.filter(
        (vendor) => vendor.categoryId === category.id,
      ).length,
    },
  });
  const vendorWithCategory = (vendor: Record<string, any>) => ({
    ...vendor,
    category: mockState.categories.find(
      (category) => category.id === vendor.categoryId,
    ),
  });

  prisma.user = {
    findUnique: vi.fn(async ({ where }: any) =>
      where.id === ADMIN_ID ? { id: ADMIN_ID, isActive: true } : null,
    ),
  };
  prisma.category = {
    findMany: vi.fn(async ({ where, skip, take }: any) => {
      const categories = mockState.categories
        .filter((category) =>
          where.name?.contains
            ? category.name
                .toLowerCase()
                .includes(where.name.contains.toLowerCase())
            : true,
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(skip, skip + take);
      return categories.map(categoryWithCount);
    }),
    count: vi.fn(async ({ where }: any) =>
      mockState.categories.filter((category) =>
        where.name?.contains
          ? category.name
              .toLowerCase()
              .includes(where.name.contains.toLowerCase())
          : true,
      ).length,
    ),
    findUnique: vi.fn(async ({ where }: any) => {
      const category = mockState.categories.find(
        (item) =>
          (where.id === undefined || item.id === where.id) &&
          (where.name === undefined || item.name === where.name),
      );
      return category ? categoryWithCount(category) : null;
    }),
    create: vi.fn(async ({ data }: any) => {
      if (mockState.categories.some((item) => item.name === data.name))
        throw prismaError("P2002");
      const category = {
        id: CATEGORY_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      mockState.categories.push(category);
      return category;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const category = mockState.categories.find((item) => item.id === where.id);
      if (!category) throw prismaError("P2025");
      if (
        mockState.categories.some(
          (item) => item.id !== where.id && item.name === data.name,
        )
      )
        throw prismaError("P2002");
      Object.assign(category, data);
      return category;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockState.categories.findIndex(
        (item) => item.id === where.id,
      );
      if (index < 0) throw prismaError("P2025");
      if (
        mockState.vendors.some(
          (vendor) => vendor.categoryId === where.id,
        )
      )
        throw prismaError("P2003");
      return mockState.categories.splice(index, 1)[0];
    }),
  };
  prisma.vendor = {
    findMany: vi.fn(async ({ where, skip, take, orderBy }: any) => {
      const [sortKey, sortOrder] = Object.entries(orderBy)[0] as [
        string,
        string,
      ];
      return mockState.vendors
        .filter((vendor) =>
          where.isActive === undefined
            ? true
            : vendor.isActive === where.isActive,
        )
        .filter((vendor) =>
          where.categoryId ? vendor.categoryId === where.categoryId : true,
        )
        .filter((vendor) =>
          where.name?.contains
            ? vendor.name.toLowerCase().includes(where.name.contains.toLowerCase())
            : true,
        )
        .sort((a, b) => {
          const compare = String(a[sortKey] ?? "").localeCompare(
            String(b[sortKey] ?? ""),
          );
          return sortOrder === "asc" ? compare : -compare;
        })
        .slice(skip, skip + take)
        .map(vendorWithCategory);
    }),
    count: vi.fn(async ({ where }: any) =>
      mockState.vendors.filter((vendor) =>
        (where.isActive === undefined ||
          vendor.isActive === where.isActive) &&
        (!where.categoryId || vendor.categoryId === where.categoryId) &&
        (!where.name?.contains ||
          vendor.name
            .toLowerCase()
            .includes(where.name.contains.toLowerCase())),
      ).length,
    ),
    findUnique: vi.fn(async ({ where }: any) => {
      const vendor = mockState.vendors.find((item) => item.id === where.id);
      return vendor
        ? where.select
          ? {
              id: vendor.id,
              priceMin: vendor.priceMin,
              priceMax: vendor.priceMax,
            }
          : vendorWithCategory(vendor)
        : null;
    }),
    create: vi.fn(async ({ data }: any) => {
      if (!mockState.categories.some((item) => item.id === data.categoryId))
        throw prismaError("P2003");
      const vendor = {
        id: VENDOR_ID,
        isActive: true,
        photos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      mockState.vendors.push(vendor);
      return vendorWithCategory(vendor);
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const vendor = mockState.vendors.find((item) => item.id === where.id);
      if (!vendor) throw prismaError("P2025");
      if (
        data.categoryId &&
        !mockState.categories.some(
          (category) => category.id === data.categoryId,
        )
      )
        throw prismaError("P2003");
      Object.assign(vendor, data, { updatedAt: new Date() });
      return vendorWithCategory(vendor);
    }),
  };
  return { prisma };
});

vi.mock("../src/core/Logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));

const auth = () => ({
  authorization: `Bearer ${createAccessToken(ADMIN_ID)}`,
});

beforeEach(() => {
  mockState.categories.length = 0;
  mockState.vendors.length = 0;
});

describe("category API", () => {
  it("requires authentication and validates category names and IDs", async () => {
    expect((await request(app).get("/api/categories")).status).toBe(401);
    const invalidName = await request(app)
      .post("/api/categories")
      .set(auth())
      .send({ name: "  " });
    expect(invalidName.status).toBe(400);

    const invalidId = await request(app)
      .get("/api/categories/not-a-uuid")
      .set(auth());
    expect(invalidId.status).toBe(400);
  });

  it("trims and deduplicates names, lists vendor counts, and blocks linked deletion", async () => {
    const created = await request(app)
      .post("/api/categories")
      .set(auth())
      .send({ name: "  Floral  " });
    expect(created.status).toBe(201);
    expect(created.body.category.name).toBe("Floral");

    const duplicate = await request(app)
      .post("/api/categories")
      .set(auth())
      .send({ name: "Floral" });
    expect(duplicate.status).toBe(409);

    const fetched = await request(app)
      .get(`/api/categories/${CATEGORY_ID}`)
      .set(auth());
    expect(fetched.body.category.name).toBe("Floral");
    const renamed = await request(app)
      .patch(`/api/categories/${CATEGORY_ID}`)
      .set(auth())
      .send({ name: "Floral Design" });
    expect(renamed.body.category.name).toBe("Floral Design");

    mockState.vendors.push({
      id: VENDOR_ID,
      name: "Bloom",
      categoryId: CATEGORY_ID,
      isActive: true,
    });
    const listed = await request(app)
      .get("/api/categories?search=flor&page=1&limit=5")
      .set(auth());
    expect(listed.body.categories[0]._count.vendors).toBe(1);
    expect(listed.body.pagination.total).toBe(1);

    const blockedDelete = await request(app)
      .delete(`/api/categories/${CATEGORY_ID}`)
      .set(auth());
    expect(blockedDelete.status).toBe(409);

    mockState.vendors.length = 0;
    const deleted = await request(app)
      .delete(`/api/categories/${CATEGORY_ID}`)
      .set(auth());
    expect(deleted.status).toBe(204);
  });
});

describe("vendor API", () => {
  beforeEach(() => {
    mockState.categories.push({
      id: CATEGORY_ID,
      name: "Florals",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("validates fields and returns category information when creating a vendor", async () => {
    expect((await request(app).get("/api/vendors")).status).toBe(401);
    const invalid = await request(app)
      .post("/api/vendors")
      .set(auth())
      .send({
        name: "Bloom",
        categoryId: CATEGORY_ID,
        email: "not-an-email",
        priceMin: 500,
        priceMax: 100,
        photos: ["not-a-url"],
      });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post("/api/vendors")
      .set(auth())
      .send({
        name: "  Bloom Studio ",
        categoryId: CATEGORY_ID,
        email: "HELLO@example.com",
        priceMin: 100,
        priceMax: 250,
        photos: ["https://example.com/photo.jpg"],
      });
    expect(created.status).toBe(201);
    expect(created.body.vendor).toMatchObject({
      name: "Bloom Studio",
      email: "hello@example.com",
      category: { id: CATEGORY_ID, name: "Florals" },
    });

    const missingCategory = await request(app)
      .post("/api/vendors")
      .set(auth())
      .send({ name: "No Category", categoryId: VENDOR_ID });
    expect(missingCategory.status).toBe(404);
  });

  it("preserves omitted fields, filters active vendors by default, and changes status", async () => {
    const created = await request(app)
      .post("/api/vendors")
      .set(auth())
      .send({
        name: "Bloom",
        categoryId: CATEGORY_ID,
        email: "hello@example.com",
      });

    const updated = await request(app)
      .patch(`/api/vendors/${VENDOR_ID}`)
      .set(auth())
      .send({ name: "Bloom Studio" });
    expect(updated.body.vendor.name).toBe("Bloom Studio");
    expect(updated.body.vendor.email).toBe("hello@example.com");
    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/vendors/${VENDOR_ID}`)
      .set(auth());
    expect(fetched.body.vendor.name).toBe("Bloom Studio");

    await request(app)
      .patch(`/api/vendors/${VENDOR_ID}/status`)
      .set(auth())
      .send({ isActive: false });
    const active = await request(app).get("/api/vendors").set(auth());
    const inactive = await request(app)
      .get("/api/vendors?status=inactive&search=studio")
      .set(auth());
    expect(active.body.vendors).toHaveLength(0);
    expect(inactive.body.vendors).toHaveLength(1);
    expect(inactive.body.vendors[0].category.name).toBe("Florals");
  });
});
