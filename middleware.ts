import { NextResponse, type NextRequest } from "next/server";

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

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token") && !cookie.name.includes("code-verifier"));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
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

  if (isProtectedRoute && !hasSupabaseAuthCookie(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
