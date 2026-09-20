import { put, get } from "@vercel/blob";

// アプリの全データを1つのJSONファイルとしてVercel Blobに保存する。
// Supabase(データベース)やUpstash(Redis)のような外部サービスへの
// 登録は不要。Vercelの Storage タブから Blob ストアを作成するだけで、
// 必要な環境変数（BLOB_READ_WRITE_TOKEN）が自動的に追加される。
const PATHNAME = "lane-log-data.json";

export async function readData() {
  // get() は見つからない場合 null を返す（例外は投げない）。
  // 見つかった場合は { statusCode, stream, headers, blob } という形で返り、
  // 本文はReadableStreamの stream に入っている点に注意する。
  const result = await get(PATHNAME, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : null;
}

export async function writeData(data) {
  await put(PATHNAME, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
}
