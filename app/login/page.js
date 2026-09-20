"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(true);
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#EEF0EA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          border: "1px solid #D8DAD1",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 340,
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: 3,
            color: "#BF3E1B",
            marginBottom: 6,
          }}
        >
          LANE LOG
        </div>
        <h1
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: 24,
            fontWeight: 600,
            margin: "0 0 20px",
            color: "#1C201D",
          }}
        >
          合言葉を入力
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 7,
            border: "1px solid #D8DAD1",
            fontSize: 14,
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />
        {error && (
          <p style={{ color: "#BF3E1B", fontSize: 12, marginTop: -8, marginBottom: 12 }}>
            パスワードが違います。
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#BF3E1B",
            color: "#fff",
            border: "none",
            padding: "10px 0",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "確認中…" : "入る"}
        </button>
      </form>
    </div>
  );
}
