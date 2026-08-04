import { PrismaClient } from "@prisma/client";

import { findMissingRequiredColumns } from "./test-database-schema.mjs";

const prisma = new PrismaClient();

try {
  const [{ database }] = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database",
  );
  if (!/(^|[_-])test($|[_-])/i.test(database)) {
    throw new Error(`Refusing to use non-test database: ${database}`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()`,
  );
  const present = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missing = findMissingRequiredColumns(present);

  if (missing.length > 0) {
    throw new Error(
      `Test database schema is behind prisma/schema.prisma; run npm run test:db:setup. Missing: ${missing.join(", ")}`,
    );
  }

  console.log(`Test database preflight passed: ${database}`);
} finally {
  await prisma.$disconnect();
}
