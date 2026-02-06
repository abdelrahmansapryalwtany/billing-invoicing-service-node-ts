import request from "supertest";
import { startTestDb, migrateTestDb } from "./helpers/testDb";

jest.setTimeout(240_000);

describe("GET /v1/invoices/:id/pdf", () => {
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
    "returns non-empty PDF bytes",
    async () => {
      try {
        const { prisma } = await import("../src/db/prisma");
        const { createApp } = await import("../src/app");
        const app = createApp();

        const customer = await prisma.customer.create({ data: { name: "PDF Co", currency: "usd" } });

        await request(app).post("/v1/charges").send({
          customerId: customer.id,
          type: "service",
          amount: 12345,
          currency: "usd",
          description: "Implementation",
          serviceDate: "2026-02-02"
        });

        const gen = await request(app).post("/v1/invoices/generate").send({
          customerId: customer.id,
          periodFrom: "2026-02-01",
          periodTo: "2026-02-28",
          taxRate: 0.15,
          issueNow: true
        });
        if (gen.status !== 200) throw new Error(`Generate invoice failed: ${gen.status} ${JSON.stringify(gen.body)}`);

        const pdfRes = await request(app)
          .get(`/v1/invoices/${gen.body.id}/pdf`)
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
            res.on("end", () => cb(null, Buffer.concat(chunks)));
          });
        if (pdfRes.status !== 200) throw new Error(`PDF failed: ${pdfRes.status} ${JSON.stringify(pdfRes.body)}`);

        expect(pdfRes.headers["content-type"]).toContain("application/pdf");
        expect(Buffer.isBuffer(pdfRes.body)).toBe(true);
        expect(pdfRes.body.length).toBeGreaterThan(1000);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("invoicePdf.test error:", err);
        throw err;
      }
    },
    120_000
  );
});

