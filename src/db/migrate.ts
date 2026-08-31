// Script para aplicar as migrations do Drizzle no banco configurado em DATABASE_URL.
// Uso: npx tsx src/db/migrate.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Aplicando migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas com sucesso.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Erro ao aplicar migrations:", err);
  process.exit(1);
});
