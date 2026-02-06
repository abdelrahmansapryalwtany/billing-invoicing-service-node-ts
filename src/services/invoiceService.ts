import Decimal from "decimal.js";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { HttpError } from "../http/httpError";

function toDateOnly(d: Date) {
  return new Date(d.toISOString().slice(0, 10));
}

function computeTaxAmount(subtotalMinor: number, taxRate: string): number {
  const tax = new Decimal(subtotalMinor).mul(new Decimal(taxRate));
  return tax.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function computeTaxForItem(amountMinor: number, taxRate: string): number {
  const tax = new Decimal(amountMinor).mul(new Decimal(taxRate));
  return tax.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function invoiceNo(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `INV-${y}${m}${d}-${rand}`;
}

function buildChargeOverlapWhere(customerId: string, periodFrom: Date, periodTo: Date): Prisma.ChargeWhereInput {
  // "serviceDate OR period overlaps [periodFrom..periodTo]"
  return {
    customerId,
    status: "unbilled",
    OR: [
      {
        serviceDate: {
          gte: periodFrom,
          lte: periodTo
        }
      },
      {
        AND: [
          { periodFrom: { not: null } },
          { periodTo: { not: null } },
          { periodFrom: { lte: periodTo } },
          { periodTo: { gte: periodFrom } }
        ]
      }
    ]
  };
}

export async function generateInvoice(input: {
  customerId: string;
  periodFrom: string;
  periodTo: string;
  taxRate?: number;
  issueNow?: boolean;
}) {
  const periodFrom = toDateOnly(new Date(input.periodFrom));
  const periodTo = toDateOnly(new Date(input.periodTo));
  const issueNow = input.issueNow ?? true;
  const taxRateStr = String(input.taxRate ?? env.INVOICE_TAX_RATE);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new HttpError({ status: 404, errorCode: "CUSTOMER_NOT_FOUND", message: "Customer not found" });

    const genReq = await tx.invoiceGenerationRequest.upsert({
      where: {
        customerId_periodFrom_periodTo: {
          customerId: input.customerId,
          periodFrom,
          periodTo
        }
      },
      update: {},
      create: {
        customerId: input.customerId,
        periodFrom,
        periodTo
      }
    });

    if (genReq.invoiceId) {
      const existing = await tx.invoice.findUnique({
        where: { id: genReq.invoiceId },
        include: { items: true }
      });
      if (!existing) throw new HttpError({ status: 500, errorCode: "IDEMPOTENCY_BROKEN", message: "Idempotency record points to missing invoice" });
      return existing;
    }

    const charges = await tx.charge.findMany({
      where: buildChargeOverlapWhere(input.customerId, periodFrom, periodTo),
      orderBy: { createdAt: "asc" }
    });

    if (charges.length === 0) {
      throw new HttpError({
        status: 422,
        errorCode: "NO_CHARGES_TO_INVOICE",
        message: "No unbilled charges for that customer and period",
        details: { customerId: input.customerId, periodFrom: input.periodFrom, periodTo: input.periodTo }
      });
    }

    const currencies = new Set(charges.map((c) => c.currency.toLowerCase()));
    if (currencies.size > 1) {
      throw new HttpError({
        status: 422,
        errorCode: "MULTI_CURRENCY_NOT_SUPPORTED",
        message: "Charges contain multiple currencies; cannot generate a single invoice",
        details: { currencies: [...currencies] }
      });
    }
    const currency = [...currencies][0] ?? customer.currency.toLowerCase();

    const subtotal = charges.reduce((sum, c) => sum + c.amount, 0);
    const taxAmount = computeTaxAmount(subtotal, taxRateStr);
    const total = subtotal + taxAmount;

    const now = new Date();
    const status: InvoiceStatus = issueNow ? "issued" : "draft";

    const invoice = await tx.invoice.create({
      data: {
        customerId: input.customerId,
        invoiceNo: invoiceNo(now),
        periodFrom,
        periodTo,
        status,
        currency,
        subtotal,
        taxRate: new Prisma.Decimal(taxRateStr),
        taxAmount,
        total,
        amountPaid: 0,
        issuedAt: now,
        dueAt: null
      }
    });

    // Per-item tax snapshot. We compute item tax by rounding each item, then adjust the first item for any rounding delta
    // so that sum(item.taxAmount) == invoice.taxAmount.
    const itemsWithTax = charges.map((c) => {
      const itemTax = computeTaxForItem(c.amount, taxRateStr);
      return {
        chargeId: c.id,
        description: c.description ?? `${c.type} charge`,
        amount: c.amount,
        taxAmount: itemTax,
        total: c.amount + itemTax
      };
    });

    const sumItemTax = itemsWithTax.reduce((s, it) => s + it.taxAmount, 0);
    const delta = taxAmount - sumItemTax;
    if (itemsWithTax.length > 0 && delta !== 0) {
      itemsWithTax[0] = {
        ...itemsWithTax[0],
        taxAmount: itemsWithTax[0].taxAmount + delta,
        total: itemsWithTax[0].total + delta
      };
    }

    await tx.invoiceItem.createMany({
      data: itemsWithTax.map((it) => ({
        invoiceId: invoice.id,
        chargeId: it.chargeId,
        description: it.description,
        amount: it.amount,
        taxRate: new Prisma.Decimal(taxRateStr),
        taxAmount: it.taxAmount,
        total: it.total
      }))
    });

    await tx.charge.updateMany({
      where: { id: { in: charges.map((c) => c.id) } },
      data: { status: "billed", invoiceId: invoice.id }
    });

    await tx.invoiceGenerationRequest.update({
      where: { id: genReq.id },
      data: { invoiceId: invoice.id }
    });

    const withItems = await tx.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true }
    });

    if (!withItems) throw new HttpError({ status: 500, errorCode: "INVOICE_CREATE_FAILED", message: "Invoice create failed" });
    return withItems;
  });
}

export async function createPayment(input: { invoiceId: string; amount: number }) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new HttpError({ status: 404, errorCode: "INVOICE_NOT_FOUND", message: "Invoice not found" });
    if (invoice.status === "void") throw new HttpError({ status: 422, errorCode: "INVOICE_VOID", message: "Cannot pay a void invoice" });

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: input.amount,
        currency: invoice.currency,
        status: "complete",
        provider: "mock"
      }
    });

    const newPaid = invoice.amountPaid + input.amount;
    const newStatus: InvoiceStatus =
      newPaid >= invoice.total ? "paid" : newPaid > 0 ? "partial" : invoice.status === "draft" ? "draft" : "issued";

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newPaid, status: newStatus }
    });

    return { payment, invoice: updated };
  });
}

