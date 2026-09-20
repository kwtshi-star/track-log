import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }
  const cookie = request.cookies.get("ll_auth")?.value;
  if (cookie !== process.env.APP_PASSWORD) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
