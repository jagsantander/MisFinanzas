import { NextResponse } from "next/server";

/**
 * Digital Asset Links para la app Android (Trusted Web Activity).
 * Servido en /.well-known/assetlinks.json (ver rewrite en next.config.ts).
 * ANDROID_CERT_SHA256 admite varias huellas separadas por coma (p. ej. clave propia + clave de Google Play).
 */
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = pkg && prints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }]
    : [];
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
