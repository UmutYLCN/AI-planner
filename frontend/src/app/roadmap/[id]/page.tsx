"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import { db, RoadmapRecord } from "@/lib/db";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Clock, CalendarDays, ArrowLeft, CheckCircle, Circle,
  Play, ChevronDown, ChevronUp, BarChart2, X, ExternalLink,
  PlaySquare, CheckCheck
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type ReactPlayerType from "react-player";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false }) as any;

// ── Types ─────────────────────────────────────────────────────────────────
type RoadmapModule = RoadmapRecord["roadmap"]["modules"][number];

interface VideoChapter {
  title: string;
  time: string;
  seconds: number;
}

interface VideoSidebarData {
  url?: string;
  moduleIdx: number;
  topicIdx: number;
  moduleName: string;
  estimatedHours: number;
  schedule: string;
  topics: string[];
  videoTitle?: string;
  chapters?: VideoChapter[];
  duration?: string;   // New: Real video duration
  viewCount?: string;  // New: Real view count
}

export default function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null);
  const [openModules, setOpenModules] = useState<number[]>([0]);
  const [sidebar, setSidebar] = useState<VideoSidebarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleComplete, setModuleComplete] = useState<Record<number, boolean>>({});

  useEffect(() => {
    db.roadmaps.get(parseInt(id)).then((r) => {
      if (r) setRoadmap(r);
      setLoading(false);
    });
  }, [id]);

  const toggleTopic = async (mIdx: number, tIdx: number) => {
    if (!roadmap) return;
    const key = `${mIdx}-${tIdx}`;
    const updated = { ...roadmap.progress, [key]: !roadmap.progress[key] };
    await db.roadmaps.update(roadmap.id!, { progress: updated });
    setRoadmap({ ...roadmap, progress: updated });
  };

  const markLessonDone = async (mIdx: number, tIdx: number) => {
    if (!roadmap) return;
    const updated = { ...roadmap.progress };
    updated[`${mIdx}-${tIdx}`] = true; // Only mark the specific topic

    await db.roadmaps.update(roadmap.id!, { progress: updated });
    setRoadmap({ ...roadmap, progress: updated });
    setModuleComplete(prev => ({ ...prev, [mIdx]: false })); // We don't mark whole module done yet
    setTimeout(() => setSidebar(null), 500);
  };

  const toggleModule = (i: number) => {
    setOpenModules((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  const sanitizeYoutubeUrl = (url?: string) => {
    if (!url || typeof url !== 'string') return undefined;

    // Improved regex to handle watch, embed, shorts, and youtu.be links
    const vidPattern = /(?:v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const vidMatch = url.match(vidPattern);

    if (vidMatch && vidMatch[1]) {
      return `https://www.youtube.com/embed/${vidMatch[1]}?autoplay=1&rel=0`;
    }

    // Extract playlist ID
    const listPattern = /[?&]list=([a-zA-Z0-9_-]+)/;
    const listMatch = url.match(listPattern);
    if (listMatch && listMatch[1]) {
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1`;
    }

    // fallback: if it's already a valid look-alike URL but doesn't match our pattern, 
    // we still try to return it if it contains youtube
    if (url.includes('youtube.com') || url.includes('youtu.be')) return url;

    return undefined;
  };

  const formatDuration = (isoDuration: string) => {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "00:00";
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatViews = (views: string) => {
    const count = parseInt(views);
    if (count >= 1000000) return (count / 1000000).toFixed(1) + "M views";
    if (count >= 1000) return (count / 1000).toFixed(1) + "K views";
    return count + " views";
  };

  const parseChapters = (description: string): VideoChapter[] => {
    if (!description) return [];
    const chapters: VideoChapter[] = [];
    
    // 'gm' flags are critical for multiline matching
    const timeRegex = /(?:^|\s)\(?(\d{1,2}:)?(\d{1,2}):(\d{2})\)?\s*[-–—:]?\s*(.*)/gm;
    let match;

    while ((match = timeRegex.exec(description)) !== null) {
      const h = match[1] ? parseInt(match[1].replace(':', '')) : 0;
      const m = parseInt(match[2]);
      const s = parseInt(match[3]);
      const title = match[4].trim();
      
      if (title.length < 2) continue;

      const totalSeconds = h * 3600 + m * 60 + s;
      
      chapters.push({
        title,
        time: `${match[1] || ""}${match[2]}:${match[3]}`,
        seconds: totalSeconds
      });
    }

    return chapters.filter((v, i, a) => a.findIndex(t => t.seconds === v.seconds) === i).sort((a,b) => a.seconds - b.seconds);
  };

  const openSidebar = async (mIdx: number, tIdx: number, mod: RoadmapModule) => {
    const sanitized = sanitizeYoutubeUrl(mod.youtube_url);
    
    setSidebar({
      url: sanitized,
      moduleIdx: mIdx,
      topicIdx: tIdx,
      moduleName: mod.module_name,
      estimatedHours: mod.estimated_hours,
      schedule: mod.suggested_schedule,
      topics: mod.topics,
      videoTitle: mod.topics[tIdx],
      chapters: []
    });

    if (sanitized) {
      try {
        const videoId = sanitized.split('?')[0].split('/').pop();
        const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

        if (apiKey && videoId) {
          const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`);
          const data = await res.json();
          
          if (data.items && data.items[0]) {
            const item = data.items[0];
            const snippet = item.snippet;
            const contentDetails = item.contentDetails;
            const statistics = item.statistics;
            
            const realChapters = parseChapters(snippet.description);
            setSidebar(prev => prev ? { 
              ...prev, 
              videoTitle: snippet.title,
              chapters: realChapters,
              duration: formatDuration(contentDetails.duration),
              viewCount: formatViews(statistics.viewCount)
            } : null);
          }
        } else {
          const cleanUrl = sanitized.split('?')[0].replace("/embed/", "/watch?v=");
          const res = await fetch(`https://noembed.com/embed?url=${cleanUrl}`);
          const data = await res.json();
          if (data.title) setSidebar(prev => prev ? { ...prev, videoTitle: data.title } : null);
        }
      } catch (err) {
        console.error("Video verisi çekilemedi:", err);
      }
    }
  };

  const jumpToTime = (seconds: number) => {
    if (!sidebar?.url) return;
    // URL'deki mevcut start parametresini temizle ve yenisini ekle
    const baseUrl = sidebar.url.split('?')[0];
    const newUrl = `${baseUrl}?autoplay=1&start=${seconds}`;
    setSidebar(prev => prev ? { ...prev, url: newUrl } : null);
  };

  const calcProgress = () => {
    if (!roadmap) return 0;
    const total = roadmap.roadmap.modules.reduce((acc, m) => acc + m.topics.length, 0);
    if (total === 0) return 0;
    const done = Object.values(roadmap.progress).filter(Boolean).length;
    return Math.round((done / total) * 100);
  };

  const MODULE_COLORS = [
    { bg: "clay-card-blue", acc: "#60a5fa" },
    { bg: "clay-card-purple", acc: "#a78bfa" },
    { bg: "clay-card-orange", acc: "#fb923c" },
    { bg: "clay-card-pink", acc: "#f472b6" },
    { bg: "clay-card-yellow", acc: "#eab308" },
    { bg: "clay-card-green", acc: "#10b981" },
  ];

  if (loading) {
    return (
      <div style={{ background: "var(--cream)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <p style={{ color: "#64748b" }}>Loading your roadmap...</p>
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div style={{ background: "var(--cream)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="clay-card clay-card-orange" style={{ padding: 48, borderRadius: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Roadmap not found</h2>
          <Link href="/dashboard" className="btn-clay btn-navy" style={{ marginTop: 16, display: "inline-flex" }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const pct = calcProgress();
  const sidebarMod = sidebar ? roadmap.roadmap.modules[sidebar.moduleIdx] : null;
  const sidebarTopicsDone = sidebar
    ? sidebar.topics.filter((_, tIdx) => roadmap.progress[`${sidebar.moduleIdx}-${tIdx}`]).length
    : 0;

  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh", position: "relative" }}>

      {/* ── Sidebar overlay backdrop ── */}
      <AnimatePresence>
        {sidebar && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebar(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 150,
              background: "rgba(51,47,58,0.45)", backdropFilter: "blur(4px)"
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Right Sidebar ── */}
      <AnimatePresence>
        {sidebar && (
          <motion.aside
            key="sidebar"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "min(520px, 100vw)", zIndex: 200,
              background: "var(--cream)",
              borderLeft: "3px solid var(--border-clay)",
              boxShadow: "-8px 0 40px rgba(51,47,58,0.15)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Sidebar header */}
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "2.5px solid var(--border-clay)",
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(10px)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: "#fee2e2",
                    border: "2px solid var(--border-clay)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    boxShadow: "2px 2px 0 var(--border-clay)"
                  }}
                >
                  <PlaySquare className="w-5 h-5" style={{ color: "#ef4444" }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 6, color: "var(--navy-mid)" }}>
                    Now Playing <span style={{ color: "var(--border-clay)", fontWeight: 400 }}>|</span>
                    <span style={{ color: "var(--navy)", fontWeight: 900 }}>{sidebar.moduleName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--navy-mid)", opacity: 0.7 }}>Stage {sidebar.moduleIdx + 1}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => setSidebar(null)}
                  style={{
                    width: 32, height: 32, borderRadius: 8, background: "white",
                    border: "2px solid var(--border-clay)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    boxShadow: "2px 2px 0 var(--border-clay)", cursor: "pointer", color: "var(--navy)"
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

              {/* Video embed – simplified to native iframe for guaranteed YouTube appearance */}
              {sidebar.url ? (
                <div style={{ position: "relative", paddingTop: "56.25%", background: "#000", borderBottom: "2.5px solid var(--border-clay)" }}>
                  <iframe
                    src={sidebar.url}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    title="YouTube video player"
                  />
                </div>
              ) : (
                <div style={{
                  padding: "28px 22px", textAlign: "center",
                  borderBottom: "2px solid rgba(51,47,58,0.1)",
                  background: "rgba(255,255,255,0.4)"
                }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📖</div>
                  <p style={{ fontSize: 14, color: "var(--navy-mid)", fontWeight: 500 }}>
                    Bu ders metin tabanlıdır.<br />Aşağıdan konuları tamamlayabilirsiniz.
                  </p>
                </div>
              )}

              {/* Dynamic Video Title Header */}
              {sidebar.url && (
                <div style={{ padding: "24px 22px 12px", borderBottom: "1.5px solid rgba(51,47,58,0.05)" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Official Lecture Video
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--navy)", lineHeight: 1.3 }}>
                    {sidebar.videoTitle || "Loading video details..."}
                  </h3>
                </div>
              )}

              {/* Module info – Dynamic YouTube Stats */}
              <div style={{ padding: "16px 22px 24px" }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {sidebar.duration && (
                    <span className="pill" style={{ fontSize: 12, background: "#fff", borderColor: "var(--border-clay)" }}>
                      <Clock className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                      {sidebar.duration} Lesson
                    </span>
                  )}
                  <span className="pill" style={{ fontSize: 12, background: "#fff", borderColor: "var(--border-clay)" }}>
                    <CalendarDays className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
                    {sidebar.schedule}
                  </span>
                </div>
              </div>

              {/* Real Video Chapters Section */}
              {sidebar.url && sidebar.chapters && sidebar.chapters.length > 0 && (
                <div style={{ padding: "0 22px 24px" }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: "var(--navy-mid)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock className="w-4 h-4" style={{ color: "#ef4444" }} /> Video Highlights
                  </div>
                  <div style={{ 
                    display: "flex", flexDirection: "column", gap: 6, 
                    maxHeight: "340px", overflowY: "auto", paddingRight: 6,
                    scrollbarWidth: "none" // Hide standard scrollbar for cleaner look
                  }}>
                    {sidebar.chapters.map((ch, i) => (
                      <button
                        key={i}
                        onClick={() => jumpToTime(ch.seconds)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          padding: "10px 14px", borderRadius: 14, background: "white",
                          border: "2.5px solid var(--border-clay)", cursor: "pointer",
                          transition: "all 0.2s", textAlign: "left",
                          boxShadow: "2px 2px 0 var(--border-clay)"
                        }}
                        className="chapter-btn"
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ch.title}
                        </span>
                        <span style={{ 
                          fontSize: 11, color: "#ef4444", fontWeight: 800, 
                          background: "#fee2e2", padding: "2px 8px", borderRadius: 8,
                          flexShrink: 0, border: "1.5px solid #fca5a5"
                        }}>
                          {ch.time}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Topics checklist removed as per user request */}
            </div>

            {/* ── Sticky bottom: Mark stage done ── */}
            <div
              style={{
                padding: "16px 22px",
                borderTop: "2.5px solid var(--border-clay)",
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(10px)",
              }}
            >
              <AnimatePresence mode="wait">
                {moduleComplete[sidebar.moduleIdx] ? (
                  <motion.div
                    key="done"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{
                      textAlign: "center", padding: "14px",
                      background: "#d1fae5", borderRadius: 16,
                      border: "2px solid #10b981", fontWeight: 800,
                      color: "#065f46", fontSize: 15
                    }}
                  >
                    🎉 Stage marked complete!
                  </motion.div>
                ) : (
                  <motion.button
                    key="btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => markLessonDone(sidebar.moduleIdx, sidebar.topicIdx)}
                    className="btn-clay btn-green"
                    style={{
                      width: "100%", justifyContent: "center",
                      fontSize: 16, padding: "14px 20px", borderRadius: 16
                    }}
                  >
                    <CheckCheck className="w-5 h-5" />
                    Mark Lesson as Complete
                  </motion.button>
                )}
              </AnimatePresence>
              <p style={{ textAlign: "center", fontSize: 12, color: "var(--navy-mid)", marginTop: 8 }}>
                This will check off only this specific video in your progress.
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Nav ── */}
      <nav
        className="clay-card"
        style={{ margin: 16, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 18 }}
      >
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
        {/* Header card */}
        <div className="clay-card" style={{ padding: 32, borderRadius: 26, marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontSize: 30, fontWeight: 800, maxWidth: "75%", lineHeight: 1.2 }}>
                {roadmap.roadmap.title}
              </h1>
              <span className="pill pill-green">
                {pct === 100 ? "✅ Completed!" : `${pct}% done`}
              </span>
            </div>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
                <Clock className="w-4 h-4" style={{ color: "#f59e0b" }} />
                {roadmap.roadmap.total_estimated_hours}h total
              </span>
              <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
                <BarChart2 className="w-4 h-4" style={{ color: "#3b82f6" }} />
                {roadmap.roadmap.recommended_daily_hours}h / day
              </span>
              <span style={{ fontSize: 14, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
                <CalendarDays className="w-4 h-4" style={{ color: "#10b981" }} />
                Finish by {roadmap.roadmap.estimated_finish_date}
              </span>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                <span>Overall Progress</span>
                <span style={{ color: pct === 100 ? "var(--green-dark)" : "var(--navy)" }}>{pct}%</span>
              </div>
              <div className="progress-track" style={{ height: 16 }}>
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modules list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {roadmap.roadmap.modules.map((mod, mIdx) => {
            const { bg, acc } = MODULE_COLORS[mIdx % MODULE_COLORS.length];
            const isOpen = openModules.includes(mIdx);
            const modDone = mod.topics.filter((_, tIdx) => roadmap.progress[`${mIdx}-${tIdx}`]).length;
            const modPct = Math.round((modDone / mod.topics.length) * 100);
            const hasVideo = !!mod.youtube_url;

            return (
              <motion.div
                key={mIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: mIdx * 0.05 }}
                className={`clay-card ${bg}`}
                style={{ borderRadius: 20, overflow: "hidden" }}
              >
                {/* Module header */}
                <div
                  style={{ padding: "18px 24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  onClick={() => toggleModule(mIdx)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: 10, background: "white",
                        border: "2px solid var(--border-clay)", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 14, color: acc,
                        boxShadow: "2px 2px 0 var(--border-clay)"
                      }}
                    >
                      {modPct === 100 ? "✓" : mIdx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        {mod.module_name}
                        {hasVideo && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            background: "#fee2e2", color: "#ef4444", borderRadius: 100,
                            border: "1.5px solid #ef4444", display: "inline-flex", alignItems: "center", gap: 3
                          }}>
                            <Play className="w-2.5 h-2.5" fill="currentColor" /> Video
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                        {mod.suggested_schedule} · {mod.estimated_hours}h · {modDone}/{mod.topics.length} done
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.5)", borderRadius: 100, overflow: "hidden", border: "1.5px solid var(--border-clay)" }}>
                        <div style={{ width: `${modPct}%`, height: "100%", background: acc, borderRadius: 100, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 28 }}>{modPct}%</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-5 h-5 ml-3 shrink-0" /> : <ChevronDown className="w-5 h-5 ml-3 shrink-0" />}
                </div>

                {/* Expandable topics */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Topics – Now each one is a premium video-style button */}
                        {mod.topics.map((topic, tIdx) => {
                          const done = !!roadmap.progress[`${mIdx}-${tIdx}`];
                          return (
                            <motion.div
                              key={tIdx}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => openSidebar(mIdx, tIdx, mod)}
                              style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "14px 18px", borderRadius: 16,
                                background: done ? "#d1fae5" : "white",
                                border: `2.5px solid ${done ? "#10b981" : "var(--border-clay)"}`,
                                boxShadow: done ? "none" : "4px 4px 0 var(--border-clay)",
                                cursor: "pointer", transition: "all 0.2s"
                              }}
                            >
                              {/* Checkbox circle */}
                              <div
                                onClick={(e) => { e.stopPropagation(); toggleTopic(mIdx, tIdx); }}
                                style={{ display: "flex", flexShrink: 0 }}
                              >
                                {done
                                  ? <CheckCircle className="w-6 h-6" style={{ color: "#10b981" }} />
                                  : <Circle className="w-6 h-6" style={{ color: "#cbd5e1" }} />
                                }
                              </div>

                              {/* Small Play Icon Design for each row */}
                              {hasVideo && (
                                <div style={{
                                  width: 32, height: 32, borderRadius: 10, background: "#fee2e2",
                                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                                }}>
                                  <Play className="w-4 h-4" fill="#ef4444" style={{ color: "#ef4444" }} />
                                </div>
                              )}

                              <div style={{ flex: 1, minWidth: 0 }}>
                                {hasVideo && (
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: -1 }}>
                                    YouTube Video
                                  </div>
                                )}
                                <div style={{
                                  fontSize: 15,
                                  textDecoration: done ? "line-through" : "none",
                                  color: done ? "#065f46" : "var(--navy)",
                                  fontWeight: 700,
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                }}>
                                  {topic}
                                </div>
                              </div>

                              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, flexShrink: 0 }}>
                                Play →
                              </span>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Completion celebration */}
        {pct === 100 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="clay-card clay-card-green"
            style={{ marginTop: 28, padding: "36px 32px", borderRadius: 24, textAlign: "center" }}
          >
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>You completed this roadmap!</h2>
            <p style={{ color: "#166534", marginBottom: 20 }}>Amazing work. Ready for the next challenge?</p>
            <Link href="/dashboard" className="btn-clay btn-navy" style={{ display: "inline-flex" }}>
              Back to Dashboard →
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}
