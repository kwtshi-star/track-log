import { NextResponse } from "next/server";
import { readData, writeData } from "../../../lib/store";

// ==============================================================
// これはSupabase版からVercel Blob版へ1回だけデータを移すための
// 一時的なAPIです。移行が完了したら、Vercelの環境変数から
// MIGRATE_SUPABASE_URL / MIGRATE_SUPABASE_SERVICE_KEY を削除し、
// このファイル（app/api/migrate-from-supabase フォルダごと）も
// 削除して問題ありません。
// ==============================================================

const KEY = "lane-log-data";

function isAuthed(request) {
  const cookie = request.cookies.get("ll_auth")?.value;
  return cookie && cookie === process.env.APP_PASSWORD;
}

export async function GET(request) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.MIGRATE_SUPABASE_URL;
  const supabaseKey = process.env.MIGRATE_SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "MIGRATE_SUPABASE_URL と MIGRATE_SUPABASE_SERVICE_KEY をVercelの環境変数に設定してから、再デプロイしてください。" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/kv_store?key=eq.${KEY}&select=value`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabaseからの取得に失敗しました (status ${res.status}): ${text}`);
    }
    const rows = await res.json();
    const value = rows?.[0]?.value;
    if (!value) {
      return NextResponse.json({ error: "Supabase側にデータが見つかりませんでした。" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";

    const existing = await readData();
    const existingChildrenCount = existing?.children?.length || 0;

    if (existingChildrenCount > 0 && !force) {
      return NextResponse.json(
        {
          error: "Blob側に既にデータが存在します。上書きしてよければ、URLの末尾に ?force=1 を付けてもう一度アクセスしてください。",
          existingChildrenCount,
        },
        { status: 409 }
      );
    }

    await writeData(value);

    const childrenCount = value.children?.length || 0;
    const recordsCount = (value.children || []).reduce((sum, c) => sum + (c.records?.length || 0), 0);

    return NextResponse.json({
      ok: true,
      message: "移行が完了しました。トップページを再読み込みして記録が表示されるか確認してください。",
      childrenCount,
      recordsCount,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
