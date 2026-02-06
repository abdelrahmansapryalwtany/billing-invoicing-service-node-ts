import express from "express";
import swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./docs/openapi";
import { errorHandler } from "./http/errorHandler";
import { notFound } from "./http/notFound";
import { healthRouter } from "./routes/health";
import { customersRouter } from "./routes/customers";
import { chargesRouter } from "./routes/charges";
import { invoicesRouter } from "./routes/invoices";
import { notificationsRouter } from "./routes/notifications";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/openapi.json", (_req, res) => res.json(openapiSpec));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use("/health", healthRouter);
  app.use("/v1/customers", customersRouter);
  app.use("/v1/charges", chargesRouter);
  app.use("/v1/invoices", invoicesRouter);
  app.use("/v1/notifications", notificationsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

