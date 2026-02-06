import swaggerJSDoc from "swagger-jsdoc";

export const openapiSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Billing/Invoicing Mini-Service",
      version: "1.0.0"
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Health" },
      { name: "Customers" },
      { name: "Charges" },
      { name: "Invoices" },
      { name: "Notifications" }
    ],
    components: {
      schemas: {
        Uuid: { type: "string", format: "uuid" },
        MoneyMinor: { type: "integer", description: "Minor units (e.g., cents)", example: 1999 },
        Currency: { type: "string", description: "ISO 4217 (lowercased)", example: "usd" },
        PaginatedResponse: {
          type: "object",
          properties: {
            items: { type: "array", items: {} },
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 123 }
          }
        },
        Customer: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/Uuid" },
            name: { type: "string" },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            currency: { $ref: "#/components/schemas/Currency" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        Charge: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/Uuid" },
            customerId: { $ref: "#/components/schemas/Uuid" },
            type: { type: "string", enum: ["storage", "service", "discount", "manual"] },
            amount: { $ref: "#/components/schemas/MoneyMinor" },
            currency: { $ref: "#/components/schemas/Currency" },
            description: { type: "string", nullable: true },
            serviceDate: { type: "string", format: "date", nullable: true },
            periodFrom: { type: "string", format: "date", nullable: true },
            periodTo: { type: "string", format: "date", nullable: true },
            status: { type: "string", enum: ["unbilled", "billed", "void"] },
            invoiceId: { $ref: "#/components/schemas/Uuid", nullable: true },
            metadata: { type: "object", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        InvoiceItem: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/Uuid" },
            invoiceId: { $ref: "#/components/schemas/Uuid" },
            chargeId: { $ref: "#/components/schemas/Uuid", nullable: true },
            description: { type: "string" },
            amount: { $ref: "#/components/schemas/MoneyMinor" },
            taxRate: { type: "string", example: "0.15" },
            taxAmount: { $ref: "#/components/schemas/MoneyMinor" },
            total: { $ref: "#/components/schemas/MoneyMinor" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        Invoice: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/Uuid" },
            customerId: { $ref: "#/components/schemas/Uuid" },
            invoiceNo: { type: "string" },
            periodFrom: { type: "string", format: "date", nullable: true },
            periodTo: { type: "string", format: "date", nullable: true },
            status: { type: "string", enum: ["draft", "issued", "paid", "partial", "void"] },
            currency: { $ref: "#/components/schemas/Currency" },
            subtotal: { $ref: "#/components/schemas/MoneyMinor" },
            taxRate: { type: "string", example: "0.15" },
            taxAmount: { $ref: "#/components/schemas/MoneyMinor" },
            total: { $ref: "#/components/schemas/MoneyMinor" },
            amountPaid: { $ref: "#/components/schemas/MoneyMinor" },
            issuedAt: { type: "string", format: "date-time" },
            dueAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            items: { type: "array", items: { $ref: "#/components/schemas/InvoiceItem" } }
          }
        },
        ErrorResponse: {
          type: "object",
          properties: {
            errorCode: { type: "string", example: "VALIDATION_ERROR" },
            message: { type: "string", example: "Invalid request" },
            details: { type: "object", example: {} }
          },
          required: ["errorCode", "message", "details"]
        }
      }
    }
  },
  apis: ["src/routes/*.ts"]
});

