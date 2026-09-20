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

// 環境変数に末尾スラッシュや余計な空白、うっかり付けた /rest/v1 などが
// 含まれていても動くように整形する（PGRST125 対策）。
function normalizeSupabaseUrl(raw) {
  let url = String(raw).trim();
  url = url.replace(/\/+$/, "");           // 末尾のスラッシュを除去
  url = url.replace(/\/rest\/v1$/, "");    // 末尾の /rest/v1 を除去
  return url;
}

export async function GET(request) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawUrl = process.env.MIGRATE_SUPABASE_URL;
  const supabaseKey = process.env.MIGRATE_SUPABASE_SERVICE_KEY?.trim();
  if (!rawUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "MIGRATE_SUPABASE_URL と MIGRATE_SUPABASE_SERVICE_KEY をVercelの環境変数に設定してから、再デプロイしてください。" },
      { status: 400 }
    );
  }

  const supabaseUrl = normalizeSupabaseUrl(rawUrl);
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") || "kv_store";
  const requestUrl = `${supabaseUrl}/rest/v1/${table}?select=*`;

  try {
    const res = await fetch(requestUrl, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Supabaseからの取得に失敗しました (status ${res.status}): ${text} / 問い合わせ先: ${requestUrl}`
      );
    }
    const rows = await res.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: `テーブル "${table}" にデータが見つかりませんでした。`, requestUrl },
        { status: 404 }
      );
    }

    // key列がある場合は該当行を、無い場合は最初の行を使う。
    const row = rows.find((r) => r?.key === KEY) || rows[0];
    const value = row?.value ?? row;

    if (!value || typeof value !== "object") {
      return NextResponse.json(
        { error: "取得できましたが、記録データの形式が想定と異なります。", sample: row },
        { status: 422 }
      );
    }

    // 旧形式（{athleteName, records}）なら新形式（{children:[...]}）に変換する。
    let normalized = value;
    if (!Array.isArray(value.children) && Array.isArray(value.records)) {
      normalized = {
        children: [
          {
            id: Date.now().toString(36),
            name: value.athleteName || "",
            records: value.records,
          },
        ],
      };
    }

    if (!Array.isArray(normalized.children)) {
      return NextResponse.json(
        { error: "記録データの形式が想定と異なります（children配列が見つかりません）。", sample: value },
        { status: 422 }
      );
    }

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

    await writeData(normalized);

    const childrenCount = normalized.children.length;
    const recordsCount = normalized.children.reduce(
      (sum, c) => sum + (c.records?.length || 0),
      0
    );

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
