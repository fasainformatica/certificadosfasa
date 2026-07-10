import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/database.types";

const protectedPrefixes = ["/dashboard", "/certificados", "/clientes", "/notificacoes", "/whatsapp", "/configuracoes"];
const authPrefixes = ["/login"];
const botApiPrefixes = ["/api/whatsapp-bot"];
const cronApiPrefixes = ["/api/cron"];
const publicDownloadPrefixes = ["/download", "/api/download"];
const publicApiPrefixes = [...botApiPrefixes, ...cronApiPrefixes, ...publicDownloadPrefixes];

const staticAssetPattern = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$/i;

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = startsWithAny(pathname, protectedPrefixes);
  const isAuthRoute = startsWithAny(pathname, authPrefixes);
  const isApiBotRoute = startsWithAny(pathname, botApiPrefixes);
  const isCronRoute = startsWithAny(pathname, cronApiPrefixes);
  const isDownloadRoute = startsWithAny(pathname, publicDownloadPrefixes);
  const isStaticAsset =
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    staticAssetPattern.test(pathname);
  const isPublicRoute =
    pathname === "/" ||
    isStaticAsset ||
    isApiBotRoute ||
    isCronRoute ||
    isDownloadRoute ||
    startsWithAny(pathname, publicApiPrefixes);

  if (isPublicRoute || (!isProtectedRoute && !isAuthRoute)) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtectedRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("erro", "supabase-env");
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
