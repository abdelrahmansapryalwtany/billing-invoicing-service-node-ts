import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../http/asyncHandler";
import { HttpError } from "../http/httpError";
import { createPayment, generateInvoice } from "../services/invoiceService";
import { generateInvoicePdf } from "../services/pdfService";

export const invoicesRouter = Router();

const GenerateInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  periodFrom: z.string().date(),
  periodTo: z.string().date(),
  taxRate: z.number().min(0).max(1).optional(),
  issueNow: z.boolean().optional()
});

/**
 * @openapi
 * /v1/invoices/generate:
 *   post:
 *     summary: Generate an invoice (atomic + idempotent by customerId+periodFrom+periodTo)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, periodFrom, periodTo]
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               periodFrom: { type: string, format: date }
 *               periodTo: { type: string, format: date }
 *               taxRate: { type: number, example: 0.15 }
 *               issueNow: { type: boolean, default: true }
 *           examples:
 *             generate:
 *               value:
 *                 customerId: 11111111-1111-1111-1111-111111111111
 *                 periodFrom: 2026-02-01
 *                 periodTo: 2026-02-29
 *                 taxRate: 0.15
 *                 issueNow: true
 *     responses:
 *       200:
 *         description: OK
 *       422:
 *         description: No charges to invoice
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
invoicesRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const input = GenerateInvoiceSchema.parse(req.body);
    const invoice = await generateInvoice(input);
    return res.json(invoice);
  })
);

const ListInvoicesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(["draft", "issued", "paid", "partial", "void"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

/**
 * @openapi
 * /v1/invoices:
 *   get:
 *     summary: List invoices
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, issued, paid, partial, void] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: OK
 */
invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = ListInvoicesQuerySchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;
    const where: Prisma.InvoiceWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.status ? { status: q.status } : {})
    };

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: q.limit }),
      prisma.invoice.count({ where })
    ]);

    return res.json({ items, page: q.page, limit: q.limit, total });
  })
);

/**
 * @openapi
 * /v1/invoices/{id}:
 *   get:
 *     summary: Get an invoice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 */
invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!invoice) throw new HttpError({ status: 404, errorCode: "INVOICE_NOT_FOUND", message: "Invoice not found" });
    return res.json(invoice);
  })
);

/**
 * @openapi
 * /v1/invoices/{id}/pdf:
 *   get:
 *     summary: Download invoice PDF
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PDF bytes
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
invoicesRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const pdf = await generateInvoicePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(pdf);
  })
);

const CreatePaymentSchema = z.object({
  amount: z.number().int().positive()
});

/**
 * @openapi
 * /v1/invoices/{id}/payments:
 *   post:
 *     summary: Create a mock payment for an invoice
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, example: 500 }
 *     responses:
 *       200:
 *         description: OK
 */
invoicesRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const input = CreatePaymentSchema.parse(req.body);
    const result = await createPayment({ invoiceId, amount: input.amount });
    return res.json(result);
  })
);

