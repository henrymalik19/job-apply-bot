import { NextResponse, type NextRequest } from "next/server";
import { exchangeAuthCode } from "@/server/auth/session";

/**
 * Where emailed auth links land (password reset): exchanges the `code` for a
 * session, then continues to `next` (same-site paths only).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/app";
  const target = request.nextUrl.clone();
  target.search = "";
  if (code && (await exchangeAuthCode(code))) {
    target.pathname = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  } else {
    target.pathname = "/login/forgot";
    target.searchParams.set("error", "expired");
  }
  return NextResponse.redirect(target);
}
