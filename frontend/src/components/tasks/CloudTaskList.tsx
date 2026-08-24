"use client";

/**
 * Renders a list of cloud tasks with its loading / empty / error states.
 *
 * A permission problem reads very differently from a dropped connection, so the two are
 * shown differently — one is a setup mistake, the other is worth retrying.
 */
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import CloudTaskItem from "@/components/tasks/CloudTaskItem";
import type { CloudTask, CloudTaskError } from "@/types/task";

interface Props {
  tasks: CloudTask[];
  today: string;
  loading: boolean;
  error: CloudTaskError | null;
  onToggle: (task: CloudTask) => Promise<void>;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
}

export default function CloudTaskList({
  tasks,
  today,
  loading,
  error,
  onToggle,
  onRetry,
  emptyTitle = "Henüz Claude görevi yok",
  emptyHint = "Claude'daki ders skill'lerin görev oluşturduğunda burada görünecek.",
}: Props) {
  // A stale list is more useful than a spinner, so only show the spinner on a cold load.
  if (loading && tasks.length === 0) {
    return (
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 48, color: "#64748b" }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--green)" }} />
        <span style={{ fontSize: 14 }}>Görevler yükleniyor…</span>
      </div>
    );
  }

  if (error && tasks.length === 0) {
    const isPermission = error.kind !== "network";
    return (
      <div
        role="alert"
        className={`clay-card ${isPermission ? "clay-card-orange" : ""}`}
        style={{ padding: 28, borderRadius: 20, textAlign: "center" }}
      >
        {isPermission ? (
          <ShieldAlert className="w-7 h-7" style={{ margin: "0 auto 12px", color: "#c2410c" }} />
        ) : (
          <AlertTriangle className="w-7 h-7" style={{ margin: "0 auto 12px", color: "#64748b" }} />
        )}
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569", marginBottom: onRetry ? 16 : 0 }}>
          {error.message}
        </p>
        {onRetry && (
          <button onClick={onRetry} className="btn-clay btn-ghost btn-sm">
            <RefreshCw className="w-4 h-4" /> Tekrar dene
          </button>
        )}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="clay-card clay-card-blue" style={{ padding: 40, borderRadius: 20, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🗒️</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{emptyTitle}</h3>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>{emptyHint}</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12, lineHeight: 1.5 }}
        >
          {error.message}
        </div>
      )}
      <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0 }}>
        {tasks.map((task) => (
          <CloudTaskItem key={task.id} task={task} today={today} onToggle={onToggle} />
        ))}
      </ul>
    </>
  );
}
