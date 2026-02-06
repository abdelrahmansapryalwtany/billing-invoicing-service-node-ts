import { startTestDb, migrateTestDb } from "./helpers/testDb";

jest.setTimeout(240_000);

describe("SEND_PENDING_INVOICES job handler", () => {
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

    migrateTestDb(databaseUrl);
  }, 120_000);

  afterAll(async () => {
    const { prisma } = await import("../src/db/prisma");
    await prisma.$disconnect();
    if (stop) await stop();
  });

  it(
    "creates CommunicationLog and marks it sent",
    async () => {
      const { prisma } = await import("../src/db/prisma");
      const { sendPendingInvoicesJobHandler } = await import("../src/jobs/sendPendingInvoicesJob");

      const customer = await prisma.customer.create({ data: { name: "Notify Co", currency: "usd" } });

      const invoice = await prisma.invoice.create({
        data: {
          customerId: customer.id,
          invoiceNo: "INV-TEST-001",
          periodFrom: new Date("2026-02-01"),
          periodTo: new Date("2026-02-28"),
          status: "issued",
          currency: "usd",
          subtotal: 1000,
          taxRate: "0.15",
          taxAmount: 150,
          total: 1150,
          amountPaid: 100,
          issuedAt: new Date(),
          dueAt: null
        }
      });
      expect(invoice.id).toBeTruthy();

      const result = await sendPendingInvoicesJobHandler();
      expect(result.customersNotified).toBe(1);

      const logs = await prisma.communicationLog.findMany({ where: { customerId: customer.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0]?.type).toBe("pending_invoices_email");
      expect(logs[0]?.status).toBe("sent");

      const payload = logs[0]?.payload as any;
      expect(payload.customerId).toBe(customer.id);
      expect(payload.invoiceIds).toContain(invoice.id);
      expect(payload.payLink).toContain("http://localhost:3000/pay?customerId=");
    },
    120_000
  );
});

