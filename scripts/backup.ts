/**
 * Copia de seguridad de la base de datos con pg_dump (formato custom, comprimido).
 *   npm run backup                 → backups/misfinanzas-AAAAMMDD-HHMMSS.dump
 * Requiere pg_dump (cliente PostgreSQL de la misma versión mayor del servidor). Ruta: PG_DUMP_PATH o PATH.
 * La copia contiene credenciales CIFRADAS; ENCRYPTION_KEY NO va en la copia: respáldala por separado.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está definida");
const dir = process.env.BACKUP_DIR ?? "backups";
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const file = path.join(dir, `misfinanzas-${stamp}.dump`);
const r = spawnSync(process.env.PG_DUMP_PATH ?? "pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, url], { stdio: "inherit" });
if (r.error) throw new Error(`No se pudo ejecutar pg_dump: ${r.error.message}`);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Copia creada: ${file}`);
