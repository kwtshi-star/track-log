"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Plus, X, Trophy, TrendingUp, Video,
  Trash2, ChevronDown, Wind, CloudSun, Pencil, Settings, AlertTriangle,
  LogOut, Users, MapPin, Download, Target
} from "lucide-react";
import { useRouter } from "next/navigation";

const PALETTE = ["#BF3E1B", "#3F6B4A", "#B8862E", "#2E5C8A", "#7A4B8A"];
const TRACK_DEFAULTS = ["100m", "200m", "4×100mリレー"];
const FIELD_DEFAULTS = ["走り幅跳び"];
const EVENT_TYPE_HINTS = {
  "100m": "track", "200m": "track", "400m": "track",
  "4×100mリレー": "track", "走り幅跳び": "field",
};
const ROUND_OPTIONS = ["", "予選", "準決勝", "決勝"];
const STANDARD_TYPES = [
  { id: "soutai", label: "県総体標準記録", color: "#2E5C8A" },
  { id: "tsushin", label: "県通信標準記録", color: "#7A4B8A" },
  { id: "shinjin", label: "県新人標準記録", color: "#3F6B4A" },
];

const eventColor = (event, eventOrder) => {
  const idx = eventOrder.indexOf(event);
  return PALETTE[idx % PALETTE.length] || PALETTE[0];
};

function guessEventType(name) {
  if (!name) return "track";
  if (EVENT_TYPE_HINTS[name]) return EVENT_TYPE_HINTS[name];
  if (name.includes("跳")) return "field";
  return "track";
}

function parseTimeToSeconds(t) {
  if (!t) return null;
  const s = String(t).trim();
  if (s.includes(":")) {
    const [m, rest] = s.split(":");
    return parseFloat(m) * 60 + parseFloat(rest);
  }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function bestAttempt(attempts) {
  if (!attempts || !attempts.length) return null;
  const vals = attempts.map((a) => parseFloat(a.distance)).filter((v) => !isNaN(v));
  if (!vals.length) return null;
  return Math.max(...vals);
}

function recordValue(r) {
  return r.eventType === "field" ? bestAttempt(r.attempts) : parseTimeToSeconds(r.time);
}

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  if (isNaN(date)) return d;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateFull(d) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  if (isNaN(date)) return d;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function recordsToCSV(records) {
  const headers = [
    "日付", "種目", "種目タイプ", "大会・記録会名", "開催場所", "予選/決勝", "レーン",
    "タイム", "1本目距離(m)", "1本目風", "1本目動画", "2本目距離(m)", "2本目風", "2本目動画",
    "3本目距離(m)", "3本目風", "3本目動画", "風", "天候", "動画リンク", "メモ",
  ];
  const rows = records.map((r) => {
    const type = r.eventType || guessEventType(r.event);
    const att = r.attempts || [];
    const get = (i, k) => (att[i] ? att[i][k] || "" : "");
    return [
      r.date || "", r.event || "", type === "field" ? "跳躍" : "トラック",
      r.meet || "", r.venue || "", r.round || "", type === "track" ? (r.lane || "") : "",
      type === "track" ? (r.time || "") : "",
      get(0, "distance"), get(0, "wind"), get(0, "videoUrl"),
      get(1, "distance"), get(1, "wind"), get(1, "videoUrl"),
      get(2, "distance"), get(2, "wind"), get(2, "videoUrl"),
      r.wind || "", r.weather || "", type === "track" ? (r.videoUrl || "") : "", r.memo || "",
    ];
  });
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

function downloadCSV(records, childName) {
  const csv = recordsToCSV([...records].sort((a, b) => (a.date < b.date ? -1 : 1)));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lanelog_${childName || "child"}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getEmbedInfo(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1);
      if (id) return { type: "youtube", id };
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        if (id) return { type: "youtube", id };
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return { type: "youtube", id };
      }
      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.split("/")[2];
        if (id) return { type: "youtube", id };
      }
    }
    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match) return { type: "drive", id: match[1] };
    }
  } catch (e) {
    return null;
  }
  return null;
}

const SPEED_OPTIONS = [1, 0.5, 0.25];

function VideoBlock({ url, uid: blockId }) {
  if (!url) return null;
  const info = getEmbedInfo(url);

  if (!info) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2E5C8A", textDecoration: "none", width: "fit-content" }}>
        <Video size={14} /> 動画を見る
      </a>
    );
  }

  if (info.type === "youtube") {
    const iframeId = `yt-${blockId}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const src = `https://www.youtube.com/embed/${info.id}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(origin)}`;
    const setRate = (rate) => {
      const el = document.getElementById(iframeId);
      if (el && el.contentWindow) {
        el.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }), "*");
      }
    };
    return (
      <div>
        <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 8, overflow: "hidden", background: "#000" }}>
          <iframe id={iframeId} src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#7A7D72" }}>再生速度</span>
          {SPEED_OPTIONS.map((rate) => (
            <button key={rate} onClick={() => setRate(rate)} className="ll-mono"
              style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid #D8DAD1", background: "#fff", color: "#4A4D42", fontSize: 11.5, cursor: "pointer" }}>
              {rate}x
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Google Drive: no playback-rate control API available for the embedded preview.
  return (
    <div>
      <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 8, overflow: "hidden", background: "#000" }}>
        <iframe src={`https://drive.google.com/file/d/${info.id}/preview`} allow="autoplay" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} />
      </div>
      <p style={{ fontSize: 11, color: "#A5A89C", margin: "6px 0 0" }}>
        Googleドライブの動画はこの画面から再生速度を変更できません。スロー再生したい場合はYouTube（限定公開）へのアップロードをおすすめします。
      </p>
    </div>
  );
}

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  meet: "", venue: "", round: "", event: "", eventType: "track",
  time: "", lane: "",
  attempts: [{ distance: "", wind: "", videoUrl: "" }, { distance: "", wind: "", videoUrl: "" }, { distance: "", wind: "", videoUrl: "" }],
  wind: "", weather: "", videoUrl: "", memo: "",
};

function migrateData(raw) {
  if (raw && Array.isArray(raw.children)) return raw;
  if (raw && Array.isArray(raw.records)) {
    return { children: [{ id: uid(), name: raw.athleteName || "", records: raw.records }] };
  }
  return { children: [] };
}

function migrateRecord(r) {
  if (r.memo !== undefined) return r;
  const parts = [];
  if (r.good) parts.push(`良かった点: ${r.good}`);
  if (r.issue) parts.push(`課題: ${r.issue}`);
  if (r.focus) parts.push(`次に意識すること: ${r.focus}`);
  return { ...r, memo: parts.join("\n") };
}

export default function LaneLog() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [standardsDraft, setStandardsDraft] = useState({ soutai: "", tsushin: "", shinjin: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/records");
        if (res.status === 401) { router.push("/login"); return; }
        const data = await res.json();
        const migrated = migrateData(data.value);
        migrated.children = migrated.children.map((c) => ({ ...c, records: (c.records || []).map(migrateRecord) }));
        setChildren(migrated.children);
        if (migrated.children.length > 0) setActiveChildId(migrated.children[0].id);
      } catch (e) {
        // start empty if fetch fails
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (nextChildren) => {
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ children: nextChildren }),
      });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error("save failed");
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

  const activeChild = children.find((c) => c.id === activeChildId) || null;
  const records = activeChild?.records || [];

  const eventOrder = useMemo(() => {
    const seen = [];
    records.forEach((r) => { if (r.event && !seen.includes(r.event)) seen.push(r.event); });
    return seen;
  }, [records]);

  const eventTypeByEvent = useMemo(() => {
    const map = {};
    records.forEach((r) => { map[r.event] = r.eventType || guessEventType(r.event); });
    return map;
  }, [records]);

  useEffect(() => {
    if (eventOrder.length > 0 && !eventOrder.includes(selectedEvent)) {
      setSelectedEvent(eventOrder[0]);
    } else if (eventOrder.length === 0) {
      setSelectedEvent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChildId, eventOrder]);

  const pbByEvent = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      const v = recordValue(r);
      if (v == null) return;
      const type = r.eventType || guessEventType(r.event);
      if (!(r.event in map)) { map[r.event] = v; return; }
      if (type === "field") { if (v > map[r.event]) map[r.event] = v; }
      else { if (v < map[r.event]) map[r.event] = v; }
    });
    return map;
  }, [records]);

  const filteredSorted = useMemo(() => {
    return records
      .filter((r) => !selectedEvent || r.event === selectedEvent)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [records, selectedEvent]);

  const chartData = useMemo(() => {
    return records
      .filter((r) => r.event === selectedEvent)
      .map((r) => ({ date: r.date, value: recordValue(r), meet: r.meet }))
      .filter((r) => r.value != null)
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [records, selectedEvent]);

  const selectedType = selectedEvent ? (eventTypeByEvent[selectedEvent] || "track") : "track";

  const updateActiveChildRecords = async (nextRecords) => {
    const nextChildren = children.map((c) => (c.id === activeChildId ? { ...c, records: nextRecords } : c));
    setChildren(nextChildren);
    await persist(nextChildren);
  };

  const openAdd = () => {
    const type = selectedEvent ? (eventTypeByEvent[selectedEvent] || "track") : "track";
    setForm({ ...emptyForm, event: selectedEvent || "", eventType: type });
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (r) => {
    setForm({
      ...emptyForm, ...r,
      attempts: r.attempts && r.attempts.length ? r.attempts.map((a) => ({ videoUrl: "", ...a })) : emptyForm.attempts,
    });
    setEditingId(r.id);
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.date || !form.event) return;
    if (form.eventType === "track" && !form.time) return;
    if (form.eventType === "field" && !form.attempts.some((a) => a.distance)) return;

    const cleanRecord = { ...form, id: editingId || uid() };
    if (form.eventType === "field") {
      cleanRecord.attempts = form.attempts.filter((a) => a.distance);
      delete cleanRecord.time;
      delete cleanRecord.lane;
      delete cleanRecord.videoUrl;
    } else {
      delete cleanRecord.attempts;
    }

    let next;
    if (editingId) {
      next = records.map((r) => (r.id === editingId ? cleanRecord : r));
    } else {
      next = [...records, cleanRecord];
    }
    setFormOpen(false);
    if (!selectedEvent) setSelectedEvent(form.event);
    await updateActiveChildRecords(next);
  };

  const deleteRecord = async (id) => {
    const next = records.filter((r) => r.id !== id);
    await updateActiveChildRecords(next);
  };

  const addChild = async () => {
    if (!newChildName.trim()) return;
    const nextChild = { id: uid(), name: newChildName.trim(), records: [] };
    const nextChildren = [...children, nextChild];
    setChildren(nextChildren);
    setNewChildName("");
    setActiveChildId(nextChild.id);
    await persist(nextChildren);
  };

  const renameChild = async (id, name) => {
    const nextChildren = children.map((c) => (c.id === id ? { ...c, name } : c));
    setChildren(nextChildren);
    await persist(nextChildren);
  };

  const deleteChild = async (id) => {
    if (children.length <= 1) return;
    const nextChildren = children.filter((c) => c.id !== id);
    setChildren(nextChildren);
    if (activeChildId === id) setActiveChildId(nextChildren[0]?.id || null);
    await persist(nextChildren);
  };

  const clearAll = async () => {
    setChildren([]);
    setActiveChildId(null);
    await persist([]);
    setConfirmClear(false);
    setSettingsOpen(false);
  };

  const currentStandards = (activeChild?.standards && selectedEvent && activeChild.standards[selectedEvent]) || {};

  const openStandards = () => {
    setStandardsDraft({
      soutai: currentStandards.soutai || "",
      tsushin: currentStandards.tsushin || "",
      shinjin: currentStandards.shinjin || "",
    });
    setStandardsOpen(true);
  };

  const saveStandards = async () => {
    if (!selectedEvent) return;
    const nextChildren = children.map((c) =>
      c.id === activeChildId
        ? { ...c, standards: { ...(c.standards || {}), [selectedEvent]: { ...standardsDraft } } }
        : c
    );
    setChildren(nextChildren);
    setStandardsOpen(false);
    await persist(nextChildren);
  };

  if (loading) {
    return (
      <div style={{ background: "#EEF0EA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1C201D", fontSize: 14, letterSpacing: 1 }}>読み込み中…</div>
      </div>
    );
  }

  const currentPB = selectedEvent ? pbByEvent[selectedEvent] : null;
  const unit = selectedType === "field" ? "m" : "秒";

  return (
    <div style={{ background: "#EEF0EA", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#1C201D" }}>
      <style>{`
        .ll-oswald { font-family: 'Oswald', sans-serif; }
        .ll-mono { font-family: 'IBM Plex Mono', monospace; }
        input, textarea, select { font-family: 'Inter', sans-serif; }
        ::placeholder { color: #A5A89C; }
        .ll-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .ll-scroll::-webkit-scrollbar-thumb { background: #D8DAD1; border-radius: 3px; }
        @keyframes ll-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div style={{ borderBottom: "1px solid #D8DAD1", background: "#EEF0EA", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 3, color: "#BF3E1B", marginBottom: 4 }}>LANE LOG</div>
              <h1 className="ll-oswald" style={{ fontSize: 30, fontWeight: 600, margin: 0, lineHeight: 1 }}>
                {activeChild ? `${activeChild.name || "名前未設定"}の走行記録` : "走行記録"}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => setSettingsOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, color: "#7A7D72" }} aria-label="設定">
                <Settings size={20} />
              </button>
              <button onClick={logout} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, color: "#7A7D72" }} aria-label="ログアウト" title="ログアウト">
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {saveError && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#BF3E1B", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} /> 保存に失敗しました。もう一度お試しください。
            </div>
          )}

          {children.length > 1 && (
            <div className="ll-scroll" style={{ display: "flex", gap: 8, marginTop: 16, overflowX: "auto", paddingBottom: 2 }}>
              {children.map((c) => {
                const active = c.id === activeChildId;
                return (
                  <button key={c.id} onClick={() => setActiveChildId(c.id)}
                    style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${active ? "#1C201D" : "#D8DAD1"}`, background: active ? "#1C201D" : "transparent", color: active ? "#fff" : "#4A4D42", fontSize: 13, cursor: "pointer" }}>
                    <Users size={13} />{c.name || "名前未設定"}
                  </button>
                );
              })}
            </div>
          )}

          {eventOrder.length > 0 && (
            <div className="ll-scroll" style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
              {eventOrder.map((ev) => {
                const active = ev === selectedEvent;
                const color = eventColor(ev, eventOrder);
                return (
                  <button key={ev} onClick={() => setSelectedEvent(ev)} className="ll-mono"
                    style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${active ? color : "#D8DAD1"}`, background: active ? color : "transparent", color: active ? "#fff" : "#4A4D42", fontSize: 13, cursor: "pointer" }}>
                    {ev}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 100px" }}>
        {children.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#7A7D72" }}>
            <div className="ll-oswald" style={{ fontSize: 22, marginBottom: 8, color: "#1C201D" }}>お子さんを登録してください</div>
            <p style={{ fontSize: 14, marginBottom: 24 }}>まずは記録するお子さんの名前を追加しましょう。</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", maxWidth: 320, margin: "0 auto" }}>
              <input value={newChildName} onChange={(e) => setNewChildName(e.target.value)} placeholder="名前" style={inputStyle} />
              <button onClick={addChild} style={primaryBtnStyle}><Plus size={16} /> 追加</button>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#7A7D72" }}>
            <div className="ll-oswald" style={{ fontSize: 22, marginBottom: 8, color: "#1C201D" }}>まだ記録がありません</div>
            <p style={{ fontSize: 14, marginBottom: 24 }}>記録会のタイムを追加して、走りの振り返りを始めましょう。</p>
            <button onClick={openAdd} style={primaryBtnStyle}><Plus size={16} /> 記録を追加</button>
          </div>
        ) : (
          <>
            {selectedEvent && currentPB != null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <Trophy size={18} color="#B8862E" />
                    <span className="ll-mono" style={{ fontSize: 11, letterSpacing: 2, color: "#7A7D72" }}>自己ベスト・{selectedEvent}</span>
                  </div>
                  <button onClick={openStandards} style={{ ...linkBtnStyle, fontSize: 12 }}><Target size={13} /> 標準記録を設定</button>
                </div>
                <div className="ll-oswald ll-mono" style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.1, marginTop: 4 }}>
                  {currentPB.toFixed(2)}<span style={{ fontSize: 22, marginLeft: 6, color: "#7A7D72" }}>{unit}</span>
                </div>
                {STANDARD_TYPES.some((t) => currentStandards[t.id]) && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    {STANDARD_TYPES.filter((t) => currentStandards[t.id]).map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4A4D42" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, display: "inline-block" }} />
                        {t.label.replace("県", "").replace("標準記録", "")}：<span className="ll-mono">{currentStandards[t.id]}{unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedEvent && currentPB == null && (
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={openStandards} style={{ ...linkBtnStyle, fontSize: 12 }}><Target size={13} /> 標準記録を設定</button>
              </div>
            )}

            {chartData.length > 1 && (() => {
              const standardValues = STANDARD_TYPES
                .map((t) => parseTimeToSeconds(currentStandards[t.id]))
                .filter((v) => v != null);
              const allValues = chartData.map((d) => d.value).concat(standardValues, currentPB != null ? [currentPB] : []);
              const min = Math.min(...allValues);
              const max = Math.max(...allValues);
              const pad = Math.max((max - min) * 0.2, 0.3);
              return (
                <div style={{ background: "#fff", border: "1px solid #D8DAD1", borderRadius: 10, padding: "16px 12px 8px", marginBottom: 28 }}>
                  <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#7A7D72", marginBottom: 8, paddingLeft: 8 }}>
                    {selectedType === "field" ? "距離の推移（上に行くほど良い）" : "タイムの推移（下に行くほど速い）"}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke="#EEF0EA" strokeDasharray="0" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "#7A7D72" }} axisLine={{ stroke: "#D8DAD1" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#7A7D72" }} axisLine={false} tickLine={false} width={48} tickCount={5} tickFormatter={(v) => v.toFixed(2)} domain={[min - pad, max + pad]} />
                      <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #D8DAD1", borderRadius: 6 }} labelFormatter={(d) => formatDateFull(d)} formatter={(v, n, p) => [`${v.toFixed(2)}${unit}`, p.payload.meet || ""]} />
                      {currentPB != null && <ReferenceLine y={currentPB} stroke="#B8862E" strokeDasharray="4 3" label={{ value: "PB", position: "insideBottomRight", fontSize: 10, fill: "#B8862E" }} />}
                      {STANDARD_TYPES.map((t) => {
                        const v = parseTimeToSeconds(currentStandards[t.id]);
                        if (v == null) return null;
                        return (
                          <ReferenceLine key={t.id} y={v} stroke={t.color} strokeDasharray="2 3"
                            label={{ value: t.label.replace("県", "").replace("標準記録", ""), position: "insideTopRight", fontSize: 10, fill: t.color }} />
                        );
                      })}
                      <Line type="monotone" dataKey="value" stroke={eventColor(selectedEvent, eventOrder)} strokeWidth={2.5} dot={{ r: 3.5, fill: eventColor(selectedEvent, eventOrder) }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#7A7D72", marginBottom: 10 }}>記録一覧・{filteredSorted.length}件</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredSorted.map((r) => {
                const type = r.eventType || guessEventType(r.event);
                const v = recordValue(r);
                const pb = pbByEvent[r.event];
                const isPB = v != null && pb != null && Math.abs(v - pb) < 0.001;
                const diff = v != null && pb != null ? (type === "field" ? pb - v : v - pb) : null;
                const expanded = expandedId === r.id;
                const color = eventColor(r.event, eventOrder);
                return (
                  <div key={r.id} style={{ background: "#fff", border: "1px solid #D8DAD1", borderRadius: 10, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: 5, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, padding: "14px 16px" }}>
                      <div onClick={() => setExpandedId(expanded ? null : r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#7A7D72", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span>{formatDateFull(r.date)}</span>
                            {r.meet && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>・{r.meet}</span>}
                            {r.venue && <span style={{ display: "flex", alignItems: "center", gap: 2 }}><MapPin size={11} />{r.venue}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            <span className="ll-oswald ll-mono" style={{ fontSize: 26, fontWeight: 600 }}>
                              {v != null ? v.toFixed(2) : "-"}<span style={{ fontSize: 14, marginLeft: 3, color: "#7A7D72" }}>{type === "field" ? "m" : "秒"}</span>
                            </span>
                            {isPB && <span className="ll-mono" style={{ fontSize: 10, background: "#B8862E", color: "#fff", padding: "2px 6px", borderRadius: 4, letterSpacing: 0.5 }}>PB</span>}
                            {!isPB && diff != null && diff > 0.001 && (
                              <span style={{ fontSize: 12, color: "#BF3E1B", display: "flex", alignItems: "center", gap: 2 }}>
                                <TrendingUp size={13} />{diff.toFixed(2)}
                              </span>
                            )}
                            {r.round && <span style={{ fontSize: 10, background: "#EEF0EA", color: "#4A4D42", padding: "2px 7px", borderRadius: 4 }}>{r.round}</span>}
                          </div>
                          {type === "field" && r.attempts && r.attempts.length > 0 && (
                            <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "#7A7D72", flexWrap: "wrap" }}>
                              {r.attempts.map((a, i) => (
                                <span key={i}>{i + 1}本目 {a.distance}m{a.wind ? `(${a.wind})` : ""}</span>
                              ))}
                            </div>
                          )}
                          {(r.wind || r.weather || (type === "track" && r.lane)) && (
                            <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, color: "#7A7D72" }}>
                              {r.wind && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Wind size={12} />{r.wind}</span>}
                              {r.weather && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><CloudSun size={12} />{r.weather}</span>}
                              {type === "track" && r.lane && <span>レーン{r.lane}</span>}
                            </div>
                          )}
                        </div>
                        <ChevronDown size={18} color="#A5A89C" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                      </div>

                      {expanded && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #EEF0EA", display: "flex", flexDirection: "column", gap: 12 }}>
                          {type === "track" && r.videoUrl && <VideoBlock url={r.videoUrl} uid={`t-${r.id}`} />}
                          {type === "field" && r.attempts && r.attempts.some((a) => a.videoUrl) && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {r.attempts.map((a, i) => a.videoUrl ? (
                                <div key={i}>
                                  <div style={{ fontSize: 11, color: "#7A7D72", marginBottom: 4 }}>{i + 1}本目の動画（{a.distance}m）</div>
                                  <VideoBlock url={a.videoUrl} uid={`a-${r.id}-${i}`} />
                                </div>
                              ) : null)}
                            </div>
                          )}
                          {r.memo && <div><div style={{ fontSize: 11, color: "#4A4D42", fontWeight: 600, marginBottom: 2 }}>メモ</div><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{r.memo}</div></div>}
                          <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                            <button onClick={() => openEdit(r)} style={linkBtnStyle}><Pencil size={13} /> 編集</button>
                            <button onClick={() => deleteRecord(r.id)} style={{ ...linkBtnStyle, color: "#BF3E1B" }}><Trash2 size={13} /> 削除</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {children.length > 0 && (
        <button onClick={openAdd} style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%", background: "#BF3E1B", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(191,62,27,0.35)", cursor: "pointer" }} aria-label="記録を追加">
          <Plus size={24} />
        </button>
      )}

      {formOpen && (
        <div style={overlayStyle} onClick={() => setFormOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="ll-oswald" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{editingId ? "記録を編集" : "記録を追加"}</h2>
              <button onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7D72" }}><X size={20} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Row>
                <Field label="日付" required><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} /></Field>
                <Field label="種目" required>
                  <input list="event-options" value={form.event}
                    onChange={(e) => setForm({ ...form, event: e.target.value, eventType: guessEventType(e.target.value) })}
                    placeholder="100m" style={inputStyle} />
                  <datalist id="event-options">
                    {[...TRACK_DEFAULTS, ...FIELD_DEFAULTS, ...eventOrder].filter((v, i, a) => a.indexOf(v) === i).map((ev) => <option key={ev} value={ev} />)}
                  </datalist>
                </Field>
              </Row>

              <Row>
                <Field label="大会・記録会名"><input value={form.meet} onChange={(e) => setForm({ ...form, meet: e.target.value })} placeholder="〇〇記録会" style={inputStyle} /></Field>
                <Field label="開催場所"><input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="〇〇競技場" style={inputStyle} /></Field>
              </Row>

              <Row>
                <Field label="予選 / 決勝">
                  <select value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} style={inputStyle}>
                    {ROUND_OPTIONS.map((r) => <option key={r} value={r}>{r || "指定なし"}</option>)}
                  </select>
                </Field>
                {form.eventType === "track" && (
                  <Field label="レーン"><input value={form.lane} onChange={(e) => setForm({ ...form, lane: e.target.value })} placeholder="3" style={inputStyle} /></Field>
                )}
              </Row>

              {form.eventType === "track" ? (
                <>
                  <Field label="タイム（秒）" required>
                    <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="13.45" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                  </Field>
                  <Field label="動画リンク">
                    <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://..." style={inputStyle} />
                    <p style={{ fontSize: 11, color: "#A5A89C", margin: "4px 0 0" }}>YouTube（限定公開）またはGoogleドライブのリンクなら記録カード内で再生できます。YouTubeはスロー再生（0.5x/0.25x）にも対応。</p>
                  </Field>
                </>
              ) : (
                <Field label="試技（最大3本・それぞれ動画も指定できます）" required>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {form.attempts.map((a, i) => (
                      <div key={i} style={{ border: "1px solid #D8DAD1", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="ll-mono" style={{ fontSize: 12, color: "#7A7D72", width: 44, flexShrink: 0 }}>{i + 1}本目</span>
                          <input value={a.distance} onChange={(e) => {
                            const next = [...form.attempts]; next[i] = { ...next[i], distance: e.target.value }; setForm({ ...form, attempts: next });
                          }} placeholder="4.52 (m)" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                          <input value={a.wind} onChange={(e) => {
                            const next = [...form.attempts]; next[i] = { ...next[i], wind: e.target.value }; setForm({ ...form, attempts: next });
                          }} placeholder="風(任意)" style={{ ...inputStyle, width: 90, flexShrink: 0 }} />
                        </div>
                        <input value={a.videoUrl} onChange={(e) => {
                          const next = [...form.attempts]; next[i] = { ...next[i], videoUrl: e.target.value }; setForm({ ...form, attempts: next });
                        }} placeholder="この本の動画リンク（任意）" style={{ ...inputStyle, marginLeft: 52, width: "calc(100% - 52px)" }} />
                      </div>
                    ))}
                  </div>
                </Field>
              )}

              <Row>
                <Field label="風"><input value={form.wind} onChange={(e) => setForm({ ...form, wind: e.target.value })} placeholder="+1.2 追い風" style={inputStyle} /></Field>
                <Field label="天候"><input value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} placeholder="晴れ" style={inputStyle} /></Field>
              </Row>

              <Field label="メモ"><textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={4} placeholder="良かった点・課題・次に意識することなど自由に" style={textareaStyle} /></Field>
            </div>

            <button onClick={saveForm}
              disabled={!form.date || !form.event || (form.eventType === "track" ? !form.time : !form.attempts.some((a) => a.distance))}
              style={{ ...primaryBtnStyle, width: "100%", justifyContent: "center", marginTop: 18,
                opacity: (!form.date || !form.event || (form.eventType === "track" ? !form.time : !form.attempts.some((a) => a.distance))) ? 0.4 : 1,
                cursor: (!form.date || !form.event || (form.eventType === "track" ? !form.time : !form.attempts.some((a) => a.distance))) ? "not-allowed" : "pointer" }}>
              保存する
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={overlayStyle} onClick={() => setSettingsOpen(false)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="ll-oswald" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>設定</h2>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7D72" }}><X size={20} /></button>
            </div>

            <div className="ll-mono" style={{ fontSize: 11, letterSpacing: 1.5, color: "#7A7D72", marginBottom: 8 }}>お子さんの管理</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {children.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={c.name} onChange={(e) => renameChild(c.id, e.target.value)} style={inputStyle} placeholder="名前" />
                  <button onClick={() => deleteChild(c.id)} disabled={children.length <= 1}
                    style={{ ...linkBtnStyle, color: children.length <= 1 ? "#D8DAD1" : "#BF3E1B", cursor: children.length <= 1 ? "not-allowed" : "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newChildName} onChange={(e) => setNewChildName(e.target.value)} placeholder="子供を追加" style={inputStyle} />
              <button onClick={addChild} style={{ ...primaryBtnStyle, flexShrink: 0 }}><Plus size={14} /></button>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #EEF0EA" }}>
              <button
                onClick={() => downloadCSV(records, activeChild?.name)}
                disabled={!activeChild || records.length === 0}
                style={{ ...linkBtnStyle, fontSize: 13, opacity: (!activeChild || records.length === 0) ? 0.4 : 1, cursor: (!activeChild || records.length === 0) ? "not-allowed" : "pointer" }}
              >
                <Download size={13} /> {activeChild?.name ? `${activeChild.name}の記録をCSVでダウンロード` : "記録をCSVでダウンロード"}
              </button>
            </div>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #EEF0EA" }}>
              {!confirmClear ? (
                <button onClick={() => setConfirmClear(true)} style={{ ...linkBtnStyle, color: "#BF3E1B", fontSize: 13 }}><Trash2 size={13} /> すべてのデータを削除（全員分）</button>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: "#BF3E1B", marginBottom: 8 }}>本当にすべての記録を削除しますか？元に戻せません。</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={clearAll} style={{ ...primaryBtnStyle, background: "#BF3E1B" }}>削除する</button>
                    <button onClick={() => setConfirmClear(false)} style={linkBtnStyle}>キャンセル</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {standardsOpen && (
        <div style={overlayStyle} onClick={() => setStandardsOpen(false)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 className="ll-oswald" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>標準記録・{selectedEvent}</h2>
              <button onClick={() => setStandardsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7D72" }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 12, color: "#7A7D72", marginBottom: 16 }}>
              目標として設定した値はグラフに基準線として表示されます（{selectedType === "field" ? "距離(m)" : "タイム(秒)"}で入力）。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STANDARD_TYPES.map((t) => (
                <Field key={t.id} label={t.label}>
                  <input
                    value={standardsDraft[t.id]}
                    onChange={(e) => setStandardsDraft({ ...standardsDraft, [t.id]: e.target.value })}
                    placeholder={selectedType === "field" ? "4.50" : "13.00"}
                    style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }}
                  />
                </Field>
              ))}
            </div>
            <button onClick={saveStandards} style={{ ...primaryBtnStyle, width: "100%", justifyContent: "center", marginTop: 18 }}>保存する</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ children }) { return <div style={{ display: "flex", gap: 10 }}>{children}</div>; }

function Field({ label, required, children }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: "block", fontSize: 11, color: "#7A7D72", marginBottom: 4, letterSpacing: 0.3 }}>
        {label}{required && <span style={{ color: "#BF3E1B" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "9px 10px", borderRadius: 7, border: "1px solid #D8DAD1", fontSize: 14, color: "#1C201D", outline: "none", boxSizing: "border-box", background: "#fff" };
const textareaStyle = { ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" };
const primaryBtnStyle = { display: "inline-flex", alignItems: "center", gap: 6, background: "#BF3E1B", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" };
const linkBtnStyle = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#4A4D42", fontSize: 12, cursor: "pointer", padding: 0 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(28,32,29,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 };
const modalStyle = { background: "#fff", borderRadius: 12, padding: 22, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" };
