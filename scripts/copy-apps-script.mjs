// Copia el script de la planilla a public/ para que la app ofrezca «Copiar código».
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/apps-script", { recursive: true });
copyFileSync("apps-script/Code.gs", "public/apps-script/Code.gs");
copyFileSync("apps-script/appsscript.json", "public/apps-script/appsscript.json");
console.log("Script de Google copiado a public/apps-script/");
