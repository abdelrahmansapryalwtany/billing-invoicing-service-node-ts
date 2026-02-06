import PgBoss from "pg-boss";
import { env } from "../config/env";
import { JobNames } from "./jobNames";
import { sendPendingInvoicesJobHandler } from "./sendPendingInvoicesJob";

let boss: PgBoss | null = null;

export async function startBoss() {
  if (process.env.NODE_ENV === "test") return null;
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.BOSS_SCHEMA
  });

  await boss.start();

  await boss.work(JobNames.SEND_PENDING_INVOICES, async () => {
    await sendPendingInvoicesJobHandler();
  });

  // Every hour
  await boss.schedule(JobNames.SEND_PENDING_INVOICES, "0 * * * *");

  return boss;
}

