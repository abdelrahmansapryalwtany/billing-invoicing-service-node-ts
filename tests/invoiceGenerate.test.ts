import request from "supertest";
import { startTestDb, migrateTestDb } from "./helpers/testDb";

jest.setTimeout(240_000);

describe("POST /v1/invoices/generate", () => {
  let databaseUrl: string;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const { container, databaseUrl: url } = await startTestDb();
    databaseUrl = url;
    stop = async () => {
      await container.stop();
    };

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl;
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.INVOICE_TAX_RATE = "0.15";

    migrateTestDb(databaseUrl);
  }, 120_000);

  afterAll(async () => {
    const { prisma } = await import("../src/db/prisma");
    await prisma.$disconnect();
    if (stop) await stop();
  });

  it(
    "generates invoice atomically, bills charges, and is idempotent per customer+period",
    async () => {
      try {
        const { prisma } = await import("../src/db/prisma");
        const { createApp } = await import("../src/app");
        const app = createApp();

        const customer = await prisma.customer.create({ data: { name: "Acme", currency: "usd" } });

        // Create charges through API
        const c1 = await request(app).post("/v1/charges").send({
          customerId: customer.id,
          type: "service",
          amount: 1000,
          currency: "usd",
          description: "Service A",
          serviceDate: "2026-02-10"
        });
        if (c1.status !== 201) throw new Error(`Charge create failed: ${c1.status} ${JSON.stringify(c1.body)}`);

        const c2 = await request(app).post("/v1/charges").send({
          customerId: customer.id,
          type: "storage",
          amount: 500,
          currency: "usd",
          description: "Storage",
          periodFrom: "2026-02-01",
          periodTo: "2026-02-28"
        });
        if (c2.status !== 201) throw new Error(`Charge create failed: ${c2.status} ${JSON.stringify(c2.body)}`);

        const periodFrom = "2026-02-01";
        const periodTo = "2026-02-28";

        const r1 = await request(app).post("/v1/invoices/generate").send({
          customerId: customer.id,
          periodFrom,
          periodTo,
          taxRate: 0.15,
          issueNow: true
        });
        if (r1.status !== 200) throw new Error(`Generate invoice failed: ${r1.status} ${JSON.stringify(r1.body)}`);
        expect(r1.body.id).toBeTruthy();
        expect(r1.body.items).toHaveLength(2);

        const subtotal = 1000 + 500;
        const taxAmount = Math.round(subtotal * 0.15);
        expect(r1.body.subtotal).toBe(subtotal);
        expect(r1.body.taxAmount).toBe(taxAmount);
        expect(r1.body.total).toBe(subtotal + taxAmount);

        const billed = await prisma.charge.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } });
        expect(billed).toHaveLength(2);
        for (const ch of billed) {
          expect(ch.status).toBe("billed");
          expect(ch.invoiceId).toBe(r1.body.id);
        }

        // Idempotent: second call returns same invoice
        const r2 = await request(app).post("/v1/invoices/generate").send({
          customerId: customer.id,
          periodFrom,
          periodTo,
          taxRate: 0.15,
          issueNow: true
        });
        expect(r2.status).toBe(200);
        expect(r2.body.id).toBe(r1.body.id);

        const invoiceCount = await prisma.invoice.count({ where: { customerId: customer.id } });
        expect(invoiceCount).toBe(1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("invoiceGenerate.test error:", err);
        throw err;
      }
    },
    120_000
  );
});

