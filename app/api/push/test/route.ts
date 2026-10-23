import { getDb } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { notify } from "@/lib/notifications";

/** Aviso de prueba: se registra en la app y el worker lo envía por push/correo respetando el silencio. */
export const POST = route(async () => {
  const { user } = await requireUser();
  await notify(getDb(), user.id, { type: "test", title: "Aviso de prueba", body: "Si ves esto, las notificaciones funcionan.", publicTitle: "Aviso de prueba de MisFinanzas", link: "/notificaciones" });
  return json({ ok: true });
});
