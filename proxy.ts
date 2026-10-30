import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isOwnerId } from "@/server/auth/owner";
import { createServiceClient } from "@/server/db/service-client";
import { isOwnerPublicPageEnabled } from "@/server/modules/public-page/public-page.service";
import { serverEnv } from "@/shared/env";

/**
 * The public status page (/) answers a real 404 while it is switched off. The
 * page itself also checks, but it streams, so by the time it could call
 * notFound() a 200 status would already be sent.
 */
async function publicPage(): Promise<NextResponse> {
  const enabled = await isOwnerPublicPageEnabled(createServiceClient(serverEnv()));
  const response = enabled ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * Refreshes the Supabase session cookie and does an optimistic redirect for
 * /app and /admin. Real authorization happens in `ownerContext()` and in RLS.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/") return publicPage();

  const env = serverEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isLogin = path === "/login";
  const isOwner = isOwnerId(data.user?.id, env.OWNER_USER_ID);

  if (!isLogin && !isOwner) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // The public page, the signed-in areas, and /login (to refresh the session).
  matcher: ["/", "/app/:path*", "/admin/:path*", "/login", "/api/app/:path*", "/api/admin/:path*"],
};
