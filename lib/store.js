import { put, get } from "@vercel/blob";

// アプリの全データを1つのJSONファイルとしてVercel Blobに保存する。
// Supabase(データベース)やUpstash(Redis)のような外部サービスへの
// 登録は不要。Vercelの Storage タブから Blob ストアを作成するだけで、
// 必要な環境変数（BLOB_READ_WRITE_TOKEN）が自動的に追加される。
const PATHNAME = "lane-log-data.json";

export async function readData() {
  try {
    const result = await get(PATHNAME, { access: "private", useCache: false });
    if (!result) return null;
    const text = await result.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    // まだ一度も保存していない場合はここに来る（データなし扱い）
    if (e?.name === "BlobNotFoundError") return null;
    throw e;
  }
}

export async function writeData(data) {
  await put(PATHNAME, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
}
