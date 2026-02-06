import { sendPendingInvoices } from "../services/notificationService";

export async function sendPendingInvoicesJobHandler(input?: { customerId?: string }) {
  return sendPendingInvoices({ customerId: input?.customerId });
}

