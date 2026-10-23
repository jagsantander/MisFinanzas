/**
 * Restaura una copia creada con `npm run backup`.
 *   npm run restore -- backups/misfinanzas-AAAAMMDD-HHMMSS.dump --yes
 * Reemplaza los objetos existentes de la base indicada en DATABASE_URL. Detén la app y el worker antes.
 * Usa la MISMA ENCRYPTION_KEY de cuando se hizo la copia, o las credenciales cifradas no podrán leerse.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [file, confirm] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL no está definida");
if (!file || !existsSync(file)) throw new Error("Indica un archivo .dump existente");
if (confirm !== "--yes") { console.error("Esto reemplaza datos. Repite con --yes para confirmar."); process.exit(1); }
const r = spawnSync(process.env.PG_RESTORE_PATH ?? "pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${url}`, file], { stdio: "inherit" });
if (r.error) throw new Error(`No se pudo ejecutar pg_restore: ${r.error.message}`);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("Restauración completada. Inicia de nuevo la app y el worker.");
