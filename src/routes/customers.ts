import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../http/asyncHandler";

export const customersRouter = Router();

const CreateCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(3).optional().nullable(),
  currency: z.string().min(3).max(3).optional()
});

/**
 * @openapi
 * /v1/customers:
 *   post:
 *     summary: Create a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Acme Inc }
 *               email: { type: string, example: billing@acme.test }
 *               phone: { type: string, example: "+1-555-0100" }
 *               currency: { type: string, example: usd }
 *     responses:
 *       201:
 *         description: Created
 */
customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = CreateCustomerSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        currency: (input.currency ?? "usd").toLowerCase()
      }
    });
    return res.status(201).json(customer);
  })
);

