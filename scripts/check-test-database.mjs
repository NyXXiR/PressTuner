import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [{ database }] = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database",
  );
  if (!/(^|[_-])test($|[_-])/i.test(database)) {
    throw new Error(`Refusing to use non-test database: ${database}`);
  }

  const requiredColumns = [
    ["team_product_subscription", "product"],
    ["team_billing_history", "product"],
    ["team_billing_history", "subscription_id"],
    ["coupon_redemption", "product"],
    ["coupon_redemption", "subscription_id"],
    ["billing_webhook_event", "transmission_id"],
    ["subscription_change", "payment_status"],
    ["subscription_change", "apply_status"],
  ];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()`,
  );
  const present = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missing = requiredColumns
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !present.has(column));

  if (missing.length > 0) {
    throw new Error(
      `Test database schema is behind prisma/schema.prisma; run npm run test:db:setup. Missing: ${missing.join(", ")}`,
    );
  }

  console.log(`Test database preflight passed: ${database}`);
} finally {
  await prisma.$disconnect();
}
