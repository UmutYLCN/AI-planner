"use client";

/**
 * One Claude-created cloud task, with the checkbox that flips it between todo and done.
 *
 * This checkbox writes to Firestore only. It is deliberately unrelated to the roadmap
 * checkboxes, which stay in Dexie/IndexedDB.
 */
import { useState } from "react";
import { CalendarDays, Check, Sparkles } from "lucide-react";

import { dueBucket, formatCalendarDay, relativeDayLabel } from "@/lib/dates";
import type { CloudTask } from "@/types/task";

const BUCKET_STYLE = {
  overdue: { background: "#fee2e2", color: "#b91c1c" },
  today: { background: "var(--green-light)", color: "var(--green-dark)" },
  upcoming: { background: "white", color: "var(--navy-mid)" },
} as const;

interface Props {
  task: CloudTask;
  today: string;
  onToggle: (task: CloudTask) => Promise<void>;
}

export default function CloudTaskItem({ task, today, onToggle }: Props) {
  const [busy, setBusy] = useState(false);
  const done = task.status === "done";
  const bucket = dueBucket(task.due_date, today);
  const badge = BUCKET_STYLE[bucket];

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(task);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className="clay-card"
      style={{
        listStyle: "none",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "16px 18px",
        borderRadius: 18,
        background: done ? "rgba(255,255,255,0.55)" : "white",
        opacity: busy ? 0.65 : 1,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${task.title} görevini ${done ? "yapılacak" : "tamamlandı"} olarak işaretle`}
        onClick={handleToggle}
        disabled={busy}
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          marginTop: 2,
          borderRadius: 9,
          border: "2.5px solid var(--border-clay)",
          background: done ? "var(--green)" : "white",
          boxShadow: "2px 2px 0 var(--border-clay)",
          cursor: busy ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {done && <Check className="w-4 h-4" style={{ color: "white" }} strokeWidth={3.5} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.35,
            color: "var(--navy)",
            textDecoration: done ? "line-through" : "none",
            opacity: done ? 0.6 : 1,
            overflowWrap: "anywhere",
          }}
        >
          {task.title}
        </div>

        {task.description && (
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "#64748b",
              margin: "6px 0 0",
              overflowWrap: "anywhere",
            }}
          >
            {task.description}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
          <span className="pill" style={{ fontSize: 11, padding: "4px 10px" }}>
            {task.subject}
          </span>
          <span
            className="pill"
            style={{ fontSize: 11, padding: "4px 10px", background: "var(--purple-clay)" }}
            title="Bu görevi oluşturan Claude skill'i"
          >
            <Sparkles className="w-3 h-3" /> {task.source_skill}
          </span>
          <span
            className="pill"
            style={{ fontSize: 11, padding: "4px 10px", ...badge }}
            title={formatCalendarDay(task.due_date)}
          >
            <CalendarDays className="w-3 h-3" />
            {done ? formatCalendarDay(task.due_date) : relativeDayLabel(task.due_date, today)}
          </span>
        </div>
      </div>
    </li>
  );
}
