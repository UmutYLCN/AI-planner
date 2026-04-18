"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import { db, RoadmapRecord } from "@/lib/db";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Clock, CalendarDays, ArrowLeft, CheckCircle, Circle, Play, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

export default function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null);
  const [openModules, setOpenModules] = useState<number[]>([0]);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const toggleModule = (i: number) => {
    setOpenModules((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  const calcProgress = () => {
    if (!roadmap) return 0;
    const total = roadmap.roadmap.modules.reduce((acc, m) => acc + m.topics.length, 0);
    if (total === 0) return 0;
    const done = Object.values(roadmap.progress).filter(Boolean).length;
    return Math.round((done / total) * 100);
  };

  const MODULE_COLORS = [
    { bg: "clay-card-blue", acc: "#3b82f6" },
    { bg: "clay-card-purple", acc: "#8b5cf6" },
    { bg: "clay-card-orange", acc: "#f97316" },
    { bg: "clay-card-pink", acc: "#ec4899" },
    { bg: "clay-card-yellow", acc: "#eab308" },
    { bg: "clay-card-green", acc: "#22c55e" },
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

  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh" }}>
      {/* Nav */}
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="pill pill-green">
                  {pct === 100 ? "✅ Completed!" : `${pct}% done`}
                </span>
              </div>
            </div>

            {/* Stats row */}
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
                <CalendarDays className="w-4 h-4" style={{ color: "#22c55e" }} />
                Finish by {roadmap.roadmap.estimated_finish_date}
              </span>
            </div>

            {/* Progress bar */}
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

        {/* Video player modal */}
        <AnimatePresence>
          {playingUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(14,26,43,0.8)", backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 24
              }}
              onClick={(e) => e.target === e.currentTarget && setPlayingUrl(null)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="clay-card"
                style={{ borderRadius: 22, overflow: "hidden", width: "100%", maxWidth: 820 }}
              >
                <div style={{ background: "var(--navy)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>▶ Now Playing</span>
                  <button
                    onClick={() => setPlayingUrl(null)}
                    style={{ color: "white", background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 18 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ position: "relative", paddingTop: "56.25%" }}>
                  <ReactPlayer
                    url={playingUrl}
                    playing
                    controls
                    width="100%"
                    height="100%"
                    style={{ position: "absolute", top: 0, left: 0 }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modules list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {roadmap.roadmap.modules.map((mod, mIdx) => {
            const { bg, acc } = MODULE_COLORS[mIdx % MODULE_COLORS.length];
            const isOpen = openModules.includes(mIdx);
            const modDone = mod.topics.filter((_, tIdx) => roadmap.progress[`${mIdx}-${tIdx}`]).length;
            const modPct = Math.round((modDone / mod.topics.length) * 100);

            return (
              <motion.div
                key={mIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: mIdx * 0.05 }}
                className={`clay-card ${bg}`}
                style={{ borderRadius: 20, overflow: "hidden" }}
              >
                {/* Module header – always visible */}
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
                      {mIdx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{mod.module_name}</div>
                      <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                        {mod.suggested_schedule} · {mod.estimated_hours}h · {modDone}/{mod.topics.length} done
                      </div>
                    </div>
                    {/* Mini progress */}
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
                        {/* YouTube video button if sourced from video */}
                        {mod.youtube_url && (
                          <button
                            onClick={() => setPlayingUrl(mod.youtube_url!)}
                            className="btn-clay btn-navy btn-sm"
                            style={{ width: "fit-content", marginBottom: 8, display: "inline-flex", gap: 6, alignItems: "center" }}
                          >
                            <Play className="w-4 h-4" /> Watch Video
                          </button>
                        )}

                        {/* Topic list */}
                        {mod.topics.map((topic, tIdx) => {
                          const done = !!roadmap.progress[`${mIdx}-${tIdx}`];
                          return (
                            <div
                              key={tIdx}
                              onClick={() => toggleTopic(mIdx, tIdx)}
                              style={{
                                display: "flex", alignItems: "flex-start", gap: 10,
                                padding: "10px 14px", borderRadius: 12,
                                background: done ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)",
                                border: "1.5px solid var(--border-clay)",
                                cursor: "pointer", transition: "all 0.2s"
                              }}
                            >
                              {done
                                ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--green)" }} />
                                : <Circle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#94a3b8" }} />
                              }
                              <span style={{
                                fontSize: 14, lineHeight: 1.5,
                                textDecoration: done ? "line-through" : "none",
                                color: done ? "#64748b" : "var(--navy)",
                                fontWeight: done ? 400 : 500
                              }}>
                                {topic}
                              </span>
                            </div>
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
