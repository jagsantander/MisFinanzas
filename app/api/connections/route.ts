import { getDb } from "@/lib/db";
import { json, requireUser, route } from "@/lib/http";
import { connectionsView } from "@/lib/views";

export const GET = route(async () => {
  const { user } = await requireUser();
  return json(await connectionsView(getDb(), user.id));
});
