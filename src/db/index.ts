import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __mlVendasQueryClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __mlVendasDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

// A conexão só é criada no primeiro uso real (lazy), nunca ao importar este
// módulo. Isso evita que o build do Next.js quebre ao "coletar dados da
// página" em ambientes onde DATABASE_URL ainda não está disponível na etapa
// de build (ela só precisa existir em runtime).
function getDb() {
  if (!globalThis.__mlVendasDb) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL não configurada. Defina a variável de ambiente DATABASE_URL."
      );
    }

    const queryClient =
      globalThis.__mlVendasQueryClient ??
      postgres(connectionString, { prepare: false });

    if (process.env.NODE_ENV !== "production") {
      globalThis.__mlVendasQueryClient = queryClient;
    }

    globalThis.__mlVendasDb = drizzle(queryClient, { schema });
  }

  return globalThis.__mlVendasDb;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
