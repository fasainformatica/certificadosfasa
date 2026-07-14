import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", {
        maxAge: 0,
        path: "/",
      });
    }
  }
}

function redirectToLoginAndClearCookies(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl, { status: 303 });
  clearSupabaseAuthCookies(request, response);
  return response;
}

export async function GET(request: NextRequest) {
  return redirectToLoginAndClearCookies(request);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // A sessão local pode estar com refresh token inválido. Mesmo assim,
    // os cookies precisam ser limpos para permitir novo login.
  }

  return redirectToLoginAndClearCookies(request);
}
