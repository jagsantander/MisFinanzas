import Link from "next/link";
import { Icon } from "./Icon";
export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="link-btn"><Icon name="chevronLeft" size={18} /> {label}</Link>;
}
