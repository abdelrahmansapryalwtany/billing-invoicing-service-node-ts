import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/asyncHandler";
import { sendPendingInvoices } from "../services/notificationService";

export const notificationsRouter = Router();

const SendPendingSchema = z.object({
  customerId: z.string().uuid().optional()
});

/**
 * @openapi
 * /v1/notifications/pending-invoices/send:
 *   post:
 *     summary: Manually trigger sending pending invoice notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: OK
 */
notificationsRouter.post(
  "/pending-invoices/send",
  asyncHandler(async (req, res) => {
    const input = SendPendingSchema.parse(req.body ?? {});
    const result = await sendPendingInvoices({ customerId: input.customerId });
    return res.json(result);
  })
);

