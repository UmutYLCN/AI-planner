"use client";

/**
 * "Claude Görevleri" section on the dashboard.
 *
 * Shows only what is due now — overdue plus today plus the next few days — and links to
 * /tasks for the full list. Reads come from the shared cloud-task store, so opening this
 * section and then the tasks page does not fetch the same window twice.
 */
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import CloudTaskList from "@/components/tasks/CloudTaskList";
import { useCloudTasks } from "@/hooks/useCloudTasks";
import { calendarDayDifference } from "@/lib/dates";

/** How far ahead the dashboard preview looks, in calendar days. */
const PREVIEW_HORIZON_DAYS = 7;
const PREVIEW_LIMIT = 5;

export default function DashboardCloudTasks() {
  const { tasks, loading, error, disabled, today, refresh, toggleStatus } = useCloudTasks();

  // Firebase not configured / owner not verified: stay out of the way entirely so the
  // roadmap dashboard looks exactly as it did before.
  if (disabled) return null;

  const openSoon = tasks.filter(
    (task) => task.status === "todo" && calendarDayDifference(today, task.due_date) <= PREVIEW_HORIZON_DAYS,
  );
  const preview = openSoon.slice(0, PREVIEW_LIMIT);
  const remaining = openSoon.length - preview.length;

  return (
    <section style={{ marginBottom: 36 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles className="w-5 h-5" style={{ color: "#7C3AED" }} /> Claude Görevleri
          </h2>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 2 }}>
            {openSoon.length > 0
              ? `Bu hafta ${openSoon.length} açık görev`
              : "Yaklaşan görev yok"}
          </p>
        </div>
        <Link href="/tasks" className="btn-clay btn-ghost btn-sm">
          Tümünü gör <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <CloudTaskList
        tasks={preview}
        today={today}
        loading={loading}
        error={error}
        onToggle={toggleStatus}
        onRetry={refresh}
        emptyTitle="Yaklaşan Claude görevi yok"
        emptyHint="Ders skill'lerin yeni görev eklediğinde burada belirir."
      />

      {remaining > 0 && (
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 10, textAlign: "center" }}>
          <Link href="/tasks" style={{ color: "var(--green-dark)", fontWeight: 700 }}>
            +{remaining} görev daha
          </Link>
        </p>
      )}
    </section>
  );
}
