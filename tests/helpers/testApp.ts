import type { Express } from "express";

export async function createTestApp(): Promise<{ app: Express }> {
  const { createApp } = await import("../../src/app");
  return { app: createApp() };
}

export async function getPrisma() {
  const { prisma } = await import("../../src/db/prisma");
  return prisma;
}

export async function resetDb() {
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "InvoiceItem",
      "Payment",
      "Charge",
      "InvoiceGenerationRequest",
      "CommunicationLog",
      "Invoice",
      "Customer"
    RESTART IDENTITY CASCADE;
  `);
}

