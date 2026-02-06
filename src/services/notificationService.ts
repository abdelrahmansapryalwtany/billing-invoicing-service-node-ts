import { env } from "../config/env";
import { prisma } from "../db/prisma";

export async function sendPendingInvoices(input: { customerId?: string }) {
  const invoices = await prisma.invoice.findMany({
    where: input.customerId
      ? { customerId: input.customerId, OR: [{ status: "issued" }, { status: "partial" }] }
      : { OR: [{ status: "issued" }, { status: "partial" }] },
    include: { customer: true }
  });

  const pending = invoices.filter((i) => i.amountPaid < i.total);

  const byCustomer = new Map<string, typeof pending>();
  for (const inv of pending) {
    const arr = byCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    byCustomer.set(inv.customerId, arr);
  }

  const results: Array<{ customerId: string; invoiceCount: number; totalDue: number; currency: string }> = [];

  for (const [customerId, customerInvoices] of byCustomer.entries()) {
    const currency = customerInvoices[0]?.currency ?? "usd";
    const totalDue = customerInvoices.reduce((sum, i) => sum + (i.total - i.amountPaid), 0);
    const payload = {
      customerId,
      invoiceCount: customerInvoices.length,
      totalDue,
      currency,
      payLink: `${env.APP_BASE_URL}/pay?customerId=${customerId}`,
      invoiceIds: customerInvoices.map((i) => i.id)
    };

    const log = await prisma.communicationLog.create({
      data: {
        customerId,
        type: "pending_invoices_email",
        status: "queued",
        payload
      }
    });

    // eslint-disable-next-line no-console
    console.log("Sending pending invoices notification", payload);

    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "sent" }
    });

    results.push({ customerId, invoiceCount: customerInvoices.length, totalDue, currency });
  }

  return { customersNotified: results.length, results };
}

