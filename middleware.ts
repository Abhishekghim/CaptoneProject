import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable without a session. "/" is the public marketing page —
// unlike the other three, a signed-in user is NOT bounced away from it.
const NO_AUTH_REQUIRED = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
// A signed-in user hitting one of these gets sent to their dashboard instead.
const AUTH_ONLY_PAGES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes return their own JSON errors and manage their own
  // authorization (see app/api/assistant/route.ts) — never redirect them to
  // an HTML login page, that would break every fetch() caller.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No backend configured yet — let requests through rather than redirect-looping to /login.
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: getUser() re-validates the session against Supabase Auth on
  // every request — never trust the cookie payload alone for route gating.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isNoAuthPath = NO_AUTH_REQUIRED.some((p) => pathname === p);
  const isAuthOnlyPage = AUTH_ONLY_PAGES.some((p) => pathname === p);

  if (!user && !isNoAuthPath) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthOnlyPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
