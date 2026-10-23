/**
 * Postgres local para desarrollo (sin Docker ni instalación global).
 * Usa binarios oficiales empaquetados por `embedded-postgres`.
 * En producción usa un Postgres administrado y define DATABASE_URL.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(".local-pg");
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "misfinanzas",
  password: "misfinanzas_local",
  port,
  persistent: true,
});

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) {
  await pg.createDatabase("misfinanzas");
  await pg.createDatabase("misfinanzas_test");
}
console.log(`Postgres local en postgres://misfinanzas:misfinanzas_local@localhost:${port}/misfinanzas`);
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
