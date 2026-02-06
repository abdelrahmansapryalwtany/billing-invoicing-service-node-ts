import { createApp } from "./app";
import { env } from "./config/env";
import { startBoss } from "./jobs/boss";

async function main() {
  const app = createApp();

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.PORT}`);
  });

  await startBoss();
}

void main();

