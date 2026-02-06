import PDFDocument from "pdfkit";
import { prisma } from "../db/prisma";
import { HttpError } from "../http/httpError";

export async function generateInvoicePdf(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true, items: true }
  });
  if (!invoice) throw new HttpError({ status: 404, errorCode: "INVOICE_NOT_FOUND", message: "Invoice not found" });

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text("Invoice", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("gray").text(`Invoice No: ${invoice.invoiceNo}`);
  doc.text(`Issued At: ${invoice.issuedAt.toISOString()}`);
  doc.fillColor("black");
  doc.moveDown();

  doc.fontSize(12).text("Bill To");
  doc.fontSize(10).text(invoice.customer.name);
  if (invoice.customer.email) doc.text(invoice.customer.email);
  if (invoice.customer.phone) doc.text(invoice.customer.phone);
  doc.moveDown();

  doc.fontSize(12).text("Items");
  doc.moveDown(0.5);

  const colAmount = 480;
  doc.fontSize(10).text("Description", 50, doc.y, { width: 400 });
  doc.text("Amount", colAmount, doc.y, { width: 100, align: "right" });
  doc.moveDown(0.25);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.5);
  doc.strokeColor("black");

  for (const item of invoice.items) {
    doc.fontSize(10).text(item.description, 50, doc.y, { width: 400 });
    doc.text(formatMinor(item.amount, invoice.currency), colAmount, doc.y, { width: 100, align: "right" });
    doc.moveDown(0.4);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown();

  const totalsX = 350;
  const rightX = 545;
  doc.fontSize(10).text("Subtotal", totalsX, doc.y, { width: 150 });
  doc.text(formatMinor(invoice.subtotal, invoice.currency), totalsX, doc.y, { width: rightX - totalsX, align: "right" });
  doc.moveDown(0.3);
  doc.text(`Tax (${invoice.taxRate.toString()})`, totalsX, doc.y, { width: 150 });
  doc.text(formatMinor(invoice.taxAmount, invoice.currency), totalsX, doc.y, { width: rightX - totalsX, align: "right" });
  doc.moveDown(0.3);
  doc.fontSize(11).text("Total", totalsX, doc.y, { width: 150 });
  doc.text(formatMinor(invoice.total, invoice.currency), totalsX, doc.y, { width: rightX - totalsX, align: "right" });
  doc.moveDown(0.3);
  doc.fontSize(10).text("Amount Paid", totalsX, doc.y, { width: 150 });
  doc.text(formatMinor(invoice.amountPaid, invoice.currency), totalsX, doc.y, { width: rightX - totalsX, align: "right" });
  doc.moveDown(0.3);
  doc.text("Remaining", totalsX, doc.y, { width: 150 });
  doc.text(
    formatMinor(Math.max(0, invoice.total - invoice.amountPaid), invoice.currency),
    totalsX,
    doc.y,
    { width: rightX - totalsX, align: "right" }
  );

  doc.end();

  const buf = await done;
  if (buf.length === 0) throw new HttpError({ status: 500, errorCode: "PDF_EMPTY", message: "Generated empty PDF" });
  return buf;
}

function formatMinor(amountMinor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);

  const factor = Math.pow(10, decimals);
  const major = Math.floor(abs / factor);
  const minorInt = abs % factor;

  const minor = decimals > 0 ? String(minorInt).padStart(decimals, "0") : "";
  const formatted = decimals > 0 ? `${major}.${minor}` : `${major}`;

  return `${sign}${currency.toUpperCase()} ${formatted}`;
}

function currencyDecimals(currency: string): number {
  const c = currency.toLowerCase();

  // Minimal ISO-4217 inspired mapping (0/3 decimal currencies). Default = 2.
  const map: Record<string, number> = {
    // 0 decimals
    jpy: 0,
    krw: 0,
    vnd: 0,
    clp: 0,
    xof: 0,
    xaf: 0,
    xpf: 0,

    // 3 decimals
    kwd: 3,
    bhd: 3,
    omr: 3,
    jod: 3,
    iqd: 3,
    tnd: 3,
    lyd: 3
  };

  return map[c] ?? 2;
}

