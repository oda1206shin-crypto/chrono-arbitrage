// ============================================================
// middleware.ts
// - セッションリフレッシュ
// - 認証ガード（/dashboard, /pricing, /collection, /alerts）
// - β招待ホワイトリストチェック（beta_users テーブル）
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 認証が必要なルート
const PROTECTED_PATHS = ["/dashboard", "/collection", "/alerts"];

// β制限対象ルート（認証済みでも beta_users にいない場合は /waitlist へ）
const BETA_REQUIRED_PATHS = ["/dashboard", "/pricing", "/collection", "/alerts"];

// パブリックルート（認証チェックをスキップ）
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/auth/callback",
  "/waitlist",
  "/api/beta",        // waitlist 登録 API
  "/api/stripe/webhook", // Stripe Webhook（認証不要）
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  // パブリックルートはスキップ
  if (isPublic(pathname)) {
    return supabaseResponse;
  }

  // セッション取得（必ず getUser() を使う）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ① 認証ガード
  const needsAuth = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ② β招待チェック（認証済みユーザーのみ）
  if (user) {
    const isBetaRoute = BETA_REQUIRED_PATHS.some((p) => pathname.startsWith(p));

    if (isBetaRoute) {
      // beta_users テーブルでホワイトリスト確認
      const { data: betaUser } = await supabase
        .from("beta_users")
        .select("status")
        .eq("email", user.email!)
        .single();

      const isApproved = betaUser?.status === "approved";

      if (!isApproved) {
        const url = request.nextUrl.clone();
        url.pathname = "/waitlist";
        // pending（申請済み）か未申請かを判別して UX 分岐
        url.searchParams.set(
          "status",
          betaUser?.status === "pending" ? "pending" : "not_registered"
        );
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
