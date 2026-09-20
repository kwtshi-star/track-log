import { NextResponse } from "next/server";
import { readData, writeData } from "../../../lib/store";

function isAuthed(request) {
  const cookie = request.cookies.get("ll_auth")?.value;
  return cookie && cookie === process.env.APP_PASSWORD;
}

export async function GET(request) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const value = await readData();
    return NextResponse.json({ value: value || { children: [] } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    await writeData(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
