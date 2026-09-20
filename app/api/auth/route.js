import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();

  if (password && password === process.env.APP_PASSWORD) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("ll_auth", password, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90, // 90日
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ error: "invalid" }, { status: 401 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ll_auth", "", { maxAge: 0, path: "/" });
  return res;
}
