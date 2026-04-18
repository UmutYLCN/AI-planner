"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Clock, CalendarDays, BarChart2, Trash2 } from "lucide-react";
import Link from "next/link";
import { db, RoadmapRecord } from "@/lib/db";
import CreateWizard from "@/components/CreateWizard";

export default function DashboardPage() {
  const [roadmaps, setRoadmaps] = useState<RoadmapRecord[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRoadmaps = async () => {
    const all = await db.roadmaps.orderBy("createdAt").reverse().toArray();
    setRoadmaps(all);
    setLoading(false);
  };

  useEffect(() => { loadRoadmaps(); }, []);

  const deleteRoadmap = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this roadmap?")) return;
    await db.roadmaps.delete(id);
    loadRoadmaps();
  };

  const calcProgress = (r: RoadmapRecord) => {
    const totalTopics = r.roadmap.modules.reduce((acc, m) => acc + m.topics.length, 0);
    if (totalTopics === 0) return 0;
    const done = Object.values(r.progress).filter(Boolean).length;
    return Math.round((done / totalTopics) * 100);
  };

  const CARD_COLORS = [
    "clay-card-blue", "clay-card-purple", "clay-card-orange",
    "clay-card-pink", "clay-card-yellow", "clay-card-green"
  ];

  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh" }}>
      {/* Navbar */}
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

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link href="/dashboard" style={{ fontWeight: 600, fontSize: 14, textDecoration: "none", padding: "8px 16px", background: "var(--navy)", borderRadius: 100, color: "white" }}>
            Dashboard
          </Link>
          <Link href="/settings" style={{ fontWeight: 600, fontSize: 14, color: "#64748b", textDecoration: "none", padding: "8px 16px" }}>
            Settings
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
          <div>
            <h1 style={{ fontSize: 38, fontWeight: 800, marginBottom: 4 }}>My Roadmaps 🗺️</h1>
            <p style={{ color: "#64748b", fontSize: 15 }}>
              {roadmaps.length === 0 ? "No roadmaps yet — create your first one!" : `${roadmaps.length} roadmap${roadmaps.length > 1 ? "s" : ""} in progress`}
            </p>
          </div>
          <button
            className="btn-clay btn-green"
            onClick={() => setShowWizard(true)}
            style={{ fontSize: 15 }}
          >
            <Plus className="w-5 h-5" /> New Roadmap
          </button>
        </div>

        {/* Stats row */}
        {roadmaps.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 36 }}>
            {[
              { label: "Total Roadmaps", value: roadmaps.length, icon: <BookOpen className="w-5 h-5" />, color: "clay-card-blue" },
              {
                label: "Avg. Progress",
                value: `${Math.round(roadmaps.reduce((a, r) => a + calcProgress(r), 0) / roadmaps.length)}%`,
                icon: <BarChart2 className="w-5 h-5" />,
                color: "clay-card-green"
              },
              {
                label: "Hours Planned",
                value: `${roadmaps.reduce((a, r) => a + r.roadmap.total_estimated_hours, 0)}h`,
                icon: <Clock className="w-5 h-5" />,
                color: "clay-card-yellow"
              },
            ].map((s) => (
              <div key={s.label} className={`clay-card ${s.color}`} style={{ padding: "20px 24px", borderRadius: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "white", border: "2px solid var(--border-clay)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "2px 2px 0 var(--border-clay)" }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Roadmap cards grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "#94a3b8", fontSize: 18 }}>Loading...</div>
        ) : roadmaps.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="clay-card clay-card-blue"
            style={{ padding: 64, textAlign: "center", borderRadius: 28 }}
          >
            <div style={{ fontSize: 64, marginBottom: 16 }}>🗺️</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>No roadmaps yet!</h2>
            <p style={{ color: "#64748b", marginBottom: 28 }}>Create your first AI-powered study plan.</p>
            <button className="btn-clay btn-green" onClick={() => setShowWizard(true)} style={{ fontSize: 15 }}>
              <Plus className="w-5 h-5" /> Create My First Roadmap
            </button>
          </motion.div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: 20 }}>
            <AnimatePresence>
              {roadmaps.map((r, i) => {
                const pct = calcProgress(r);
                const color = CARD_COLORS[i % CARD_COLORS.length];
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/roadmap/${r.id}`} style={{ textDecoration: "none" }}>
                      <div className={`clay-card ${color}`} style={{ padding: 24, borderRadius: 22, cursor: "pointer" }}>
                        {/* Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <h3 style={{ fontWeight: 700, fontSize: 17, maxWidth: "80%", lineHeight: 1.3 }}>
                            {r.roadmap.title || r.title}
                          </h3>
                          <button
                            onClick={(e) => deleteRoadmap(r.id!, e)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Meta */}
                        <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock className="w-3.5 h-3.5" /> {r.roadmap.total_estimated_hours}h total
                          </span>
                          <span style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 4 }}>
                            <CalendarDays className="w-3.5 h-3.5" /> {r.roadmap.estimated_finish_date}
                          </span>
                        </div>

                        {/* Progress */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Progress</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? "var(--green-dark)" : "var(--navy)" }}>{pct}%</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {/* Stages count */}
                        <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>
                          {r.roadmap.modules.length} stages · {r.roadmap.modules.reduce((a, m) => a + m.topics.length, 0)} topics
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* ── Wizard Modal ── */}
      <AnimatePresence>
        {showWizard && (
          <CreateWizard
            onClose={() => setShowWizard(false)}
            onCreated={() => { setShowWizard(false); loadRoadmaps(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
