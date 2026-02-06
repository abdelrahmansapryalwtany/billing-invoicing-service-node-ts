import { execSync } from "node:child_process";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

export async function startTestDb() {
  const container = await new PostgreSqlContainer("postgres:16")
    .withDatabase("billing")
    .withUsername("app")
    .withPassword("app")
    .start();

  const databaseUrl = `${container.getConnectionUri()}?schema=public`;

  return { container, databaseUrl };
}

export function migrateTestDb(databaseUrl: string) {
  const projectRoot = path.resolve(__dirname, "..", "..");
  execSync("npx prisma migrate deploy", {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit"
  });
}

