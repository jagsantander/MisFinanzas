import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const cur = await getCurrentSession();
  if (!cur) redirect("/entrar");
  return <AppShell>{children}</AppShell>;
}
