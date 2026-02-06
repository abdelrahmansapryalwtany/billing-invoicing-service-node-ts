import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../http/asyncHandler";
import { HttpError } from "../http/httpError";

export const chargesRouter = Router();

const ChargeTypeSchema = z.enum(["storage", "service", "discount", "manual"]);
const ChargeStatusSchema = z.enum(["unbilled", "billed", "void"]);

const CreateChargeSchema = z.object({
  customerId: z.string().uuid(),
  type: ChargeTypeSchema,
  amount: z.number().int(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().min(1).optional(),
  serviceDate: z.string().date().optional(),
  periodFrom: z.string().date().optional(),
  periodTo: z.string().date().optional(),
  metadata: z.unknown().optional()
});

/**
 * @openapi
 * /v1/charges:
 *   post:
 *     summary: Create a charge
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, type, amount]
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               type: { type: string, enum: [storage, service, discount, manual] }
 *               amount: { type: integer, example: 1999 }
 *               currency: { type: string, example: usd }
 *               description: { type: string, example: Storage for Jan 2026 }
 *               serviceDate: { type: string, format: date }
 *               periodFrom: { type: string, format: date }
 *               periodTo: { type: string, format: date }
 *               metadata: { type: object }
 *           examples:
 *             createCharge:
 *               value:
 *                 customerId: 11111111-1111-1111-1111-111111111111
 *                 type: service
 *                 amount: 2500
 *                 currency: usd
 *                 description: Consulting
 *                 serviceDate: 2026-02-01
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
chargesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = CreateChargeSchema.parse(req.body);

    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new HttpError({ status: 404, errorCode: "CUSTOMER_NOT_FOUND", message: "Customer not found" });

    const charge = await prisma.charge.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        amount: input.amount,
        currency: (input.currency ?? customer.currency).toLowerCase(),
        description: input.description,
        serviceDate: input.serviceDate ? new Date(input.serviceDate) : null,
        periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
        periodTo: input.periodTo ? new Date(input.periodTo) : null,
        metadata: input.metadata as never
      }
    });

    return res.status(201).json(charge);
  })
);

const ListChargesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: ChargeStatusSchema.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

/**
 * @openapi
 * /v1/charges:
 *   get:
 *     summary: List charges
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [unbilled, billed, void] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
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
chargesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = ListChargesQuerySchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;

    const where: Prisma.ChargeWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {})
            }
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.charge.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: q.limit }),
      prisma.charge.count({ where })
    ]);

    return res.json({
      items,
      page: q.page,
      limit: q.limit,
      total
    });
  })
);

const UpdateChargeSchema = z.object({
  type: ChargeTypeSchema.optional(),
  amount: z.number().int().optional(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().min(1).nullable().optional(),
  serviceDate: z.string().date().nullable().optional(),
  periodFrom: z.string().date().nullable().optional(),
  periodTo: z.string().date().nullable().optional(),
  metadata: z.unknown().nullable().optional()
});

/**
 * @openapi
 * /v1/charges/{id}:
 *   patch:
 *     summary: Update a charge
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 */
chargesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = UpdateChargeSchema.parse(req.body);

    const existing = await prisma.charge.findUnique({ where: { id } });
    if (!existing) throw new HttpError({ status: 404, errorCode: "CHARGE_NOT_FOUND", message: "Charge not found" });
    if (existing.status === "void") throw new HttpError({ status: 422, errorCode: "CHARGE_VOID", message: "Cannot edit a void charge" });

    const updated = await prisma.charge.update({
      where: { id },
      data: {
        ...(input.type ? { type: input.type } : {}),
        ...(typeof input.amount === "number" ? { amount: input.amount } : {}),
        ...(input.currency ? { currency: input.currency.toLowerCase() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.serviceDate !== undefined
          ? { serviceDate: input.serviceDate === null ? null : new Date(input.serviceDate) }
          : {}),
        ...(input.periodFrom !== undefined ? { periodFrom: input.periodFrom === null ? null : new Date(input.periodFrom) } : {}),
        ...(input.periodTo !== undefined ? { periodTo: input.periodTo === null ? null : new Date(input.periodTo) } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as never } : {})
      }
    });

    return res.json(updated);
  })
);

/**
 * @openapi
 * /v1/charges/{id}:
 *   delete:
 *     summary: Void a charge (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
 */
chargesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.charge.findUnique({ where: { id } });
    if (!existing) throw new HttpError({ status: 404, errorCode: "CHARGE_NOT_FOUND", message: "Charge not found" });

    const updated = await prisma.charge.update({
      where: { id },
      data: { status: "void" }
    });

    return res.json(updated);
  })
);

