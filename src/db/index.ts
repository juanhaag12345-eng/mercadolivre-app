import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __mlVendasQueryClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não configurada. Defina a variável de ambiente DATABASE_URL."
  );
}

// Reutiliza a conexão entre hot-reloads em dev e entre invocações serverless
const queryClient =
  globalThis.__mlVendasQueryClient ??
  postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalThis.__mlVendasQueryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
