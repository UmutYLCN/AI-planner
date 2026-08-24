"use client";

/**
 * Claude Görevleri — every cloud task created by Claude teacher skills through the MCP
 * connector. Roadmaps stay on the dashboard; this page is only about Firestore tasks.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, CalendarClock, CheckCircle2, ListTodo, LogOut, RefreshCw, Sparkles } from "lucide-react";

import CloudTaskList from "@/components/tasks/CloudTaskList";
import { useOwnerAuth } from "@/components/auth/OwnerGate";
import { useCloudTasks } from "@/hooks/useCloudTasks";
import { dueBucket } from "@/lib/dates";

type Filter = "open" | "today" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "open", label: "Açık" },
  { id: "today", label: "Bugün" },
  { id: "all", label: "Tümü" },
];

export default function TasksPage() {
  const { tasks, loading, error, disabled, today, refresh, toggleStatus } = useCloudTasks();
  const { status, signOutOwner } = useOwnerAuth();
  const [filter, setFilter] = useState<Filter>("open");

  const counts = useMemo(() => {
    let open = 0;
    let dueToday = 0;
    let overdue = 0;
    for (const task of tasks) {
      if (task.status === "todo") {
        open += 1;
        if (dueBucket(task.due_date, today) === "overdue") overdue += 1;
      }
      if (dueBucket(task.due_date, today) === "today") dueToday += 1;
    }
    return { open, dueToday, overdue, done: tasks.length - open };
  }, [tasks, today]);

  const visibleTasks = useMemo(() => {
    if (filter === "open") return tasks.filter((task) => task.status === "todo");
    if (filter === "today") return tasks.filter((task) => dueBucket(task.due_date, today) === "today");
    return tasks;
  }, [tasks, filter, today]);

  const stats = [
    { label: "Açık görev", value: counts.open, icon: <ListTodo className="w-5 h-5" />, color: "clay-card-blue" },
    { label: "Bugün", value: counts.dueToday, icon: <CalendarClock className="w-5 h-5" />, color: "clay-card-yellow" },
    { label: "Tamamlanan", value: counts.done, icon: <CheckCircle2 className="w-5 h-5" />, color: "clay-card-green" },
  ];

  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh" }}>
      <nav
        className="clay-card"
        style={{
          margin: 16,
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div
            className="clay-card clay-card-green"
            style={{ padding: "8px 10px", borderRadius: 12, boxShadow: "2px 2px 0 var(--border-clay)", display: "flex" }}
          >
            <BookOpen className="w-5 h-5" style={{ color: "var(--green-dark)" }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>AI Planner</span>
        </Link>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link
            href="/dashboard"
            style={{ fontWeight: 600, fontSize: 14, color: "#64748b", textDecoration: "none", padding: "8px 16px" }}
          >
            Dashboard
          </Link>
          <Link
            href="/tasks"
            style={{
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              padding: "8px 16px",
              background: "var(--navy)",
              borderRadius: 100,
              color: "white",
            }}
          >
            Claude Görevleri
          </Link>
          {status === "ready" && (
            <button
              onClick={signOutOwner}
              title="Kilitle"
              aria-label="Kilitle"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                padding: 8,
                display: "flex",
              }}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </nav>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles className="w-7 h-7" style={{ color: "#7C3AED" }} /> Claude Görevleri
            </h1>
            <p style={{ color: "#64748b", fontSize: 15, maxWidth: 520, lineHeight: 1.55 }}>
              Ders skill&apos;lerinin oluşturduğu görevler. Tamamlama işaretini yalnızca buradan sen
              koyarsın.
              {counts.overdue > 0 && (
                <span style={{ color: "#b91c1c", fontWeight: 700 }}> {counts.overdue} görev gecikmiş.</span>
              )}
            </p>
          </div>
          <button onClick={refresh} disabled={disabled || loading} className="btn-clay btn-ghost btn-sm">
            <RefreshCw className="w-4 h-4" /> Yenile
          </button>
        </div>

        {!disabled && tasks.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`clay-card ${stat.color}`}
                style={{ padding: "18px 20px", borderRadius: 18, display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: "white",
                    border: "2px solid var(--border-clay)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "2px 2px 0 var(--border-clay)",
                    flexShrink: 0,
                  }}
                >
                  {stat.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{stat.value}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {disabled ? (
          <div className="clay-card clay-card-yellow" style={{ padding: 32, borderRadius: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Cloud görevler kapalı</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
              Firebase yapılandırması tamamlanmadığı için Claude görevleri yüklenemiyor. Kurulum
              adımları için depodaki <code>SETUP_FREE.md</code> dosyasına bak. Roadmap özelliği bundan
              etkilenmez.
            </p>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Görev filtresi"
              style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}
            >
              {FILTERS.map((option) => {
                const active = filter === option.id;
                return (
                  <button
                    key={option.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(option.id)}
                    className="pill"
                    style={{
                      cursor: "pointer",
                      background: active ? "var(--navy)" : "white",
                      color: active ? "white" : "var(--navy)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <CloudTaskList
                tasks={visibleTasks}
                today={today}
                loading={loading}
                error={error}
                onToggle={toggleStatus}
                onRetry={refresh}
                emptyTitle={
                  filter === "all" ? "Henüz Claude görevi yok" : "Bu filtrede görev yok"
                }
                emptyHint={
                  filter === "all"
                    ? "Claude'daki ders skill'lerin görev oluşturduğunda burada görünecek."
                    : "Başka bir filtre deneyebilirsin."
                }
              />
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
