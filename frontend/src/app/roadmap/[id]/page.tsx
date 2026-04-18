"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import { db, RoadmapRecord, DayResource } from "@/lib/db";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Clock, CalendarDays, ArrowLeft, CheckCircle, Circle,
  Play, BarChart2, X, PlaySquare, CheckCheck, FileText, ChevronRight
} from "lucide-react";
import Link from "next/link";

// ── Types ───────────────────────────────────────────────────────────────────
interface SidebarData {
  dayIdx: number;
  resIdx: number;
  resource: DayResource;
  resolvedPdfUrl?: string;
  // Video metadata
  videoTitle?: string;
  duration?: string;
  chapters?: { title: string; time: string; seconds: number }[];
}

export default function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null);
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.roadmaps.get(parseInt(id)).then((r) => {
      if (r) setRoadmap(r);
      setLoading(false);
    });
  }, [id]);

  // ── Progress helpers ───────────────────────────────────────────────────────
  const isDone = (dayIdx: number, resIdx: number) =>
    !!roadmap?.progress[`${dayIdx}-${resIdx}`];

  const toggleDone = async (dayIdx: number, resIdx: number) => {
    if (!roadmap) return;
    const key = `${dayIdx}-${resIdx}`;
    const updated = { ...roadmap.progress, [key]: !roadmap.progress[key] };
    await db.roadmaps.update(roadmap.id!, { progress: updated });
    setRoadmap({ ...roadmap, progress: updated });
  };

  const markDone = async (dayIdx: number, resIdx: number) => {
    if (!roadmap) return;
    const key = `${dayIdx}-${resIdx}`;
    const updated = { ...roadmap.progress, [key]: true };
    await db.roadmaps.update(roadmap.id!, { progress: updated });
    setRoadmap({ ...roadmap, progress: updated });
    setTimeout(() => setSidebar(null), 400);
  };

  const calcProgress = () => {
    if (!roadmap) return 0;
    const total = (roadmap.roadmap.days ?? []).reduce((a, d) => a + d.resources.length, 0);
    if (!total) return 0;
    const done = Object.values(roadmap.progress).filter(Boolean).length;
    return Math.round((done / total) * 100);
  };

  // ── URL helpers ────────────────────────────────────────────────────────────
  const sanitizeYoutubeUrl = (url?: string) => {
    if (!url || typeof url !== "string") return undefined;
    const vidPattern = /(?:v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const vidMatch = url.match(vidPattern);
    if (vidMatch?.[1]) return `https://www.youtube.com/embed/${vidMatch[1]}?autoplay=1&rel=0`;
    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch?.[1]) return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1`;
    return undefined;
  };

  const formatDuration = (iso: string) => {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return "";
    const h = parseInt(m[1]) || 0, min = parseInt(m[2]) || 0, s = parseInt(m[3]) || 0;
    return h > 0 ? `${h}:${min.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${min}:${s.toString().padStart(2, "0")}`;
  };

  const parseChapters = (desc: string) => {
    if (!desc) return [];
    const results: { title: string; time: string; seconds: number }[] = [];
    const re = /(?:^|\s)\(?(\d{1,2}:)?(\d{1,2}):(\d{2})\)?\s*[-–—:]?\s*(.*)/gm;
    let m;
    while ((m = re.exec(desc)) !== null) {
      const h = m[1] ? parseInt(m[1]) : 0, min = parseInt(m[2]), s = parseInt(m[3]);
      const title = m[4].trim();
      if (title.length < 2) continue;
      results.push({ title, time: `${m[1] || ""}${m[2]}:${m[3]}`, seconds: h * 3600 + min * 60 + s });
    }
    return results.filter((v, i, a) => a.findIndex(t => t.seconds === v.seconds) === i).sort((a, b) => a.seconds - b.seconds);
  };

  // ── Open Sidebar ───────────────────────────────────────────────────────────
  const openSidebar = async (dayIdx: number, resIdx: number, resource: DayResource) => {
    // Resolve PDF blob if available
    let resolvedPdfUrl: string | undefined;
    if (resource.type === "pdf" && resource.pdf_name && roadmap?.attachedFiles) {
      const file = roadmap.attachedFiles.find(f => f.name === resource.pdf_name);
      if (file) resolvedPdfUrl = URL.createObjectURL(file.data);
    }

    setSidebar({ dayIdx, resIdx, resource, resolvedPdfUrl });

    // Fetch YouTube metadata
    if (resource.type === "video" && resource.youtube_url) {
      const sanitized = sanitizeYoutubeUrl(resource.youtube_url);
      if (!sanitized) return;
      try {
        const videoId = sanitized.split("?")[0].split("/").pop();
        const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        if (apiKey && videoId) {
          const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`);
          const data = await res.json();
          if (data.items?.[0]) {
            const { snippet, contentDetails } = data.items[0];
            setSidebar(prev => prev ? {
              ...prev,
              videoTitle: snippet.title,
              duration: formatDuration(contentDetails.duration),
              chapters: parseChapters(snippet.description),
            } : null);
          }
        }
      } catch { /* silent */ }
    }
  };

  const jumpToChapter = (seconds: number) => {
    if (!sidebar?.resource.youtube_url) return;
    const sanitized = sanitizeYoutubeUrl(sidebar.resource.youtube_url);
    if (!sanitized) return;
    const base = sanitized.split("?")[0];
    setSidebar(prev => prev ? { ...prev, resource: { ...prev.resource, youtube_url: `${base}?autoplay=1&start=${seconds}` } } : null);
  };

  // ── Color palette (for day cards) ─────────────────────────────────────────
  const DAY_COLORS = [
    { bg: "clay-card-blue",   pill: "#60a5fa", pillBg: "#dbeafe" },
    { bg: "clay-card-purple", pill: "#a78bfa", pillBg: "#ede9fe" },
    { bg: "clay-card-orange", pill: "#fb923c", pillBg: "#ffedd5" },
    { bg: "clay-card-pink",   pill: "#f472b6", pillBg: "#fce7f3" },
    { bg: "clay-card-yellow", pill: "#eab308", pillBg: "#fef9c3" },
    { bg: "clay-card-green",  pill: "#10b981", pillBg: "#d1fae5" },
  ];

  // ── Loading / Not found ────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: "var(--cream)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
        <p style={{ color: "#64748b" }}>Loading your roadmap...</p>
      </div>
    </div>
  );

  if (!roadmap) return (
    <div style={{ background: "var(--cream)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="clay-card clay-card-orange" style={{ padding: 48, borderRadius: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
        <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Roadmap not found</h2>
        <Link href="/dashboard" className="btn-clay btn-navy" style={{ marginTop: 16, display: "inline-flex" }}>← Dashboard</Link>
      </div>
    </div>
  );

  const pct = calcProgress();
  const days = roadmap.roadmap.days ?? [];

  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh", position: "relative" }}>

      {/* ── Sidebar backdrop ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebar && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebar(null)}
            style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(51,47,58,0.45)", backdropFilter: "blur(4px)" }}
          />
        )}
      </AnimatePresence>

      {/* ── Right Sidebar ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebar && (
          <motion.aside
            key="sidebar"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "min(520px, 100vw)", zIndex: 200,
              background: "var(--cream)", borderLeft: "3px solid var(--border-clay)",
              boxShadow: "-8px 0 40px rgba(51,47,58,0.15)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            {/* Sidebar header */}
            <div style={{
              padding: "18px 22px", borderBottom: "2.5px solid var(--border-clay)",
              background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: sidebar.resource.type === "video" ? "#fee2e2" : "#d1fae5",
                  border: "2px solid var(--border-clay)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "2px 2px 0 var(--border-clay)",
                }}>
                  {sidebar.resource.type === "video"
                    ? <PlaySquare className="w-5 h-5" style={{ color: "#ef4444" }} />
                    : <FileText className="w-5 h-5" style={{ color: "#059669" }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--navy)", lineHeight: 1.2 }}>
                    {sidebar.resource.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--navy-mid)", opacity: 0.7, marginTop: 2 }}>
                    Day {sidebar.dayIdx + 1}
                    {sidebar.resource.type === "pdf" && sidebar.resource.page_range && ` · ${sidebar.resource.page_range}`}
                    {sidebar.duration && ` · ${sidebar.duration}`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSidebar(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: "white",
                  border: "2px solid var(--border-clay)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  boxShadow: "2px 2px 0 var(--border-clay)", cursor: "pointer", color: "var(--navy)", flexShrink: 0,
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

              {/* ── Top view: video player OR pdf viewer ── */}
              {(sidebar.resource.type === "video" && sidebar.resource.youtube_url) ? (
                <div style={{ position: "relative", paddingTop: "56.25%", background: "#000", borderBottom: "2.5px solid var(--border-clay)", flexShrink: 0 }}>
                  <iframe
                    src={sanitizeYoutubeUrl(sidebar.resource.youtube_url)}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="video"
                  />
                </div>
              ) : sidebar.resolvedPdfUrl ? (
                <div style={{ position: "relative", paddingTop: "75%", background: "#f8fafc", borderBottom: "2.5px solid var(--border-clay)", flexShrink: 0 }}>
                  <iframe
                    src={sidebar.resolvedPdfUrl}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    title="PDF viewer"
                  />
                </div>
              ) : sidebar.resource.type === "pdf" ? (
                /* PDF not locally attached — info state */
                <div style={{ padding: "32px 22px", textAlign: "center", borderBottom: "2px solid rgba(51,47,58,0.08)", background: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: "#d1fae5", border: "2px solid var(--border-clay)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <FileText className="w-8 h-8" style={{ color: "#059669" }} />
                  </div>
                  <p style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>{sidebar.resource.pdf_name}</p>
                  <p style={{ fontSize: 13, color: "#64748b" }}>{sidebar.resource.page_range ?? "Open your local file to study."}</p>
                </div>
              ) : null}

              {/* ── Video title (only for videos) ── */}
              {sidebar.resource.type === "video" && sidebar.videoTitle && (
                <div style={{ padding: "18px 22px 0", borderBottom: "1px solid rgba(51,47,58,0.06)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>YouTube</div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--navy)", lineHeight: 1.35 }}>{sidebar.videoTitle}</h3>
                </div>
              )}

              {/* ── Topics to cover ── */}
              {sidebar.resource.topics.length > 0 && (
                <div style={{ padding: "20px 22px 8px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--navy-mid)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    {sidebar.resource.type === "pdf" ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {sidebar.resource.type === "pdf" ? "Topics in this section" : "What you'll learn"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sidebar.resource.topics.map((topic, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "10px 14px", borderRadius: 12,
                        background: "white", border: "1.5px solid var(--border-clay)",
                        boxShadow: "2px 2px 0 var(--border-clay)",
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, background: sidebar.resource.type === "pdf" ? "#d1fae5" : "#fee2e2",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, fontSize: 10, fontWeight: 800,
                          color: sidebar.resource.type === "pdf" ? "#059669" : "#ef4444",
                        }}>{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", lineHeight: 1.45 }}>{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Video chapters ── */}
              {sidebar.resource.type === "video" && sidebar.chapters && sidebar.chapters.length > 0 && (
                <div style={{ padding: "16px 22px 24px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--navy-mid)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock className="w-3.5 h-3.5" style={{ color: "#ef4444" }} /> Video Chapters
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                    {sidebar.chapters.map((ch, i) => (
                      <button
                        key={i}
                        onClick={() => jumpToChapter(ch.seconds)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          padding: "9px 14px", borderRadius: 12, background: "white",
                          border: "1.5px solid var(--border-clay)", cursor: "pointer",
                          boxShadow: "2px 2px 0 var(--border-clay)", textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</span>
                        <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 800, background: "#fee2e2", padding: "2px 8px", borderRadius: 8, flexShrink: 0 }}>{ch.time}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sticky footer: mark done ── */}
            <div style={{ padding: "16px 22px", borderTop: "2.5px solid var(--border-clay)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)" }}>
              {isDone(sidebar.dayIdx, sidebar.resIdx) ? (
                <div style={{ textAlign: "center", padding: "12px", background: "#d1fae5", borderRadius: 14, border: "2px solid #10b981", fontWeight: 800, color: "#065f46", fontSize: 15 }}>
                  ✅ Completed!
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => markDone(sidebar.dayIdx, sidebar.resIdx)}
                  className="btn-clay btn-green"
                  style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "13px 20px", borderRadius: 14 }}
                >
                  <CheckCheck className="w-5 h-5" /> Mark as Complete
                </motion.button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="clay-card" style={{ margin: 16, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 18 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div className="clay-card clay-card-green" style={{ padding: "8px 10px", borderRadius: 12, boxShadow: "2px 2px 0 var(--border-clay)", display: "flex" }}>
            <BookOpen className="w-5 h-5" style={{ color: "var(--green-dark)" }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>AI Planner</span>
        </Link>
        <Link href="/dashboard" className="btn-clay btn-ghost btn-sm" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div className="clay-card" style={{ padding: 32, borderRadius: 26, marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, maxWidth: "75%", lineHeight: 1.2 }}>{roadmap.roadmap.title}</h1>
            <span className={`pill ${pct === 100 ? "pill-green" : ""}`}>{pct === 100 ? "✅ Completed!" : `${pct}% done`}</span>
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
            <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
              <Clock className="w-4 h-4" style={{ color: "#f59e0b" }} />{roadmap.roadmap.total_estimated_hours}h total
            </span>
            <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
              <BarChart2 className="w-4 h-4" style={{ color: "#3b82f6" }} />{roadmap.roadmap.recommended_daily_hours}h / day
            </span>
            <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
              <CalendarDays className="w-4 h-4" style={{ color: "#10b981" }} />Finish by {roadmap.roadmap.estimated_finish_date}
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
              <span>Overall Progress</span>
              <span style={{ color: pct === 100 ? "var(--green-dark)" : "var(--navy)" }}>{pct}%</span>
            </div>
            <div className="progress-track" style={{ height: 14 }}>
              <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
            </div>
          </div>
        </div>

        {/* ── Day cards list ─────────────────────────────────────────────── */}
        {days.length === 0 ? (
          <div className="clay-card clay-card-orange" style={{ padding: 48, borderRadius: 24, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗓️</div>
            <h2 style={{ fontWeight: 800 }}>No schedule generated</h2>
            <p style={{ color: "#64748b", marginTop: 8 }}>Try creating a new roadmap with the updated system.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {days.map((day, dayIdx) => {
              const { bg, pill: pillColor, pillBg } = DAY_COLORS[dayIdx % DAY_COLORS.length];
              const totalRes = day.resources.length;
              const doneCount = day.resources.filter((_, rIdx) => isDone(dayIdx, rIdx)).length;
              const dayPct = totalRes > 0 ? Math.round((doneCount / totalRes) * 100) : 0;

              return (
                <motion.div
                  key={dayIdx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dayIdx * 0.04 }}
                  className={`clay-card ${bg}`}
                  style={{ borderRadius: 20, overflow: "hidden" }}
                >
                  {/* Day header */}
                  <div style={{ padding: "18px 22px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                    {/* Day number badge */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 13, background: "white",
                      border: "2.5px solid var(--border-clay)", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 16, color: pillColor,
                      boxShadow: "3px 3px 0 var(--border-clay)",
                    }}>
                      {dayPct === 100 ? "✓" : dayIdx + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>Day {day.day}</div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                        {day.total_hours}h · {doneCount}/{totalRes} done
                      </div>
                    </div>

                    {/* Progress chip */}
                    <div style={{
                      padding: "4px 12px", borderRadius: 100,
                      background: dayPct === 100 ? "#d1fae5" : "rgba(255,255,255,0.6)",
                      border: `1.5px solid ${dayPct === 100 ? "#10b981" : "var(--border-clay)"}`,
                      fontSize: 12, fontWeight: 700,
                      color: dayPct === 100 ? "#059669" : "var(--navy)",
                    }}>
                      {dayPct}%
                    </div>
                  </div>

                  {/* Resource rows */}
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {day.resources.map((res, resIdx) => {
                      const done = isDone(dayIdx, resIdx);
                      const isPdf = res.type === "pdf";
                      const resColor = isPdf ? "#059669" : "#ef4444";
                      const resBg = isPdf ? "#d1fae5" : "#fee2e2";

                      return (
                        <motion.div
                          key={resIdx}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => openSidebar(dayIdx, resIdx, res)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 16px", borderRadius: 14,
                            background: done ? "#f0fdf4" : "white",
                            border: `2px solid ${done ? "#10b981" : "var(--border-clay)"}`,
                            boxShadow: done ? "none" : "3px 3px 0 var(--border-clay)",
                            cursor: "pointer", transition: "all 0.18s",
                          }}
                        >
                          {/* Type icon */}
                          <div style={{
                            width: 34, height: 34, borderRadius: 10, background: done ? "#d1fae5" : resBg,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            {isPdf
                              ? <FileText className="w-4 h-4" style={{ color: done ? "#10b981" : resColor }} />
                              : <Play className="w-4 h-4" fill={done ? "#10b981" : resColor} style={{ color: done ? "#10b981" : resColor }} />}
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Resource type label */}
                            <div style={{ fontSize: 10, fontWeight: 800, color: done ? "#10b981" : resColor, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 1 }}>
                              {isPdf ? "PDF Reading" : "Video"}
                            </div>
                            {/* Title */}
                            <div style={{
                              fontSize: 14, fontWeight: 700,
                              color: done ? "#065f46" : "var(--navy)",
                              textDecoration: done ? "line-through" : "none",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {res.title}
                            </div>
                            {/* PDF badge: filename + page range */}
                            {isPdf && (res.pdf_name || res.page_range) && (
                              <div style={{
                                marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4,
                                fontSize: 11, fontWeight: 700, color: "#059669",
                                background: "#d1fae5", padding: "2px 8px", borderRadius: 100,
                                border: "1.5px solid #6ee7b7",
                              }}>
                                <BookOpen className="w-3 h-3" />
                                {res.pdf_name}{res.page_range ? ` · ${res.page_range}` : ""}
                              </div>
                            )}
                          </div>

                          {/* Done toggle + arrow */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <div
                              onClick={(e) => { e.stopPropagation(); toggleDone(dayIdx, resIdx); }}
                              style={{ cursor: "pointer", lineHeight: 0 }}
                            >
                              {done
                                ? <CheckCircle className="w-5 h-5" style={{ color: "#10b981" }} />
                                : <Circle className="w-5 h-5" style={{ color: "#cbd5e1" }} />}
                            </div>
                            <ChevronRight className="w-4 h-4" style={{ color: "#94a3b8" }} />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Completion celebration ─────────────────────────────────────── */}
        {pct === 100 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="clay-card clay-card-green"
            style={{ marginTop: 28, padding: "36px 32px", borderRadius: 24, textAlign: "center" }}
          >
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>You completed this roadmap!</h2>
            <p style={{ color: "#166534", marginBottom: 20 }}>Amazing work. Ready for your next challenge?</p>
            <Link href="/dashboard" className="btn-clay btn-navy" style={{ display: "inline-flex" }}>
              Back to Dashboard →
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}
