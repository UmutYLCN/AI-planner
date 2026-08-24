import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CloudTaskList from "@/components/tasks/CloudTaskList";
import type { CloudTask } from "@/types/task";

const task: CloudTask = {
  id: "t1",
  title: "Present perfect tekrar et",
  subject: "English",
  source_skill: "english-teacher",
  description: "20 soru çöz",
  due_date: "2026-08-24",
  status: "todo",
  idempotency_key: "auto:x",
  created_at: null,
  updated_at: null,
  completed_at: null,
};

describe("CloudTaskList", () => {
  it("shows a loading state on a cold load with no cached tasks", () => {
    render(<CloudTaskList tasks={[]} today="2026-08-24" loading error={null} onToggle={vi.fn()} />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
  });

  it("prefers showing stale tasks over a spinner during a background refresh", () => {
    render(<CloudTaskList tasks={[task]} today="2026-08-24" loading error={null} onToggle={vi.fn()} />);
    expect(screen.getByText("Present perfect tekrar et")).toBeInTheDocument();
    expect(screen.queryByText(/yükleniyor/i)).not.toBeInTheDocument();
  });

  it("shows the empty state with custom copy when there are no tasks", () => {
    render(
      <CloudTaskList
        tasks={[]}
        today="2026-08-24"
        loading={false}
        error={null}
        onToggle={vi.fn()}
        emptyTitle="Bu filtrede görev yok"
        emptyHint="Başka bir filtre deneyebilirsin."
      />,
    );
    expect(screen.getByText("Bu filtrede görev yok")).toBeInTheDocument();
    expect(screen.getByText("Başka bir filtre deneyebilirsin.")).toBeInTheDocument();
  });

  it("shows a permission error distinctly from a network error, with a retry action", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <CloudTaskList
        tasks={[]}
        today="2026-08-24"
        loading={false}
        error={{ kind: "permission", message: "Bu Google hesabı yetkili değil." }}
        onToggle={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Bu Google hesabı yetkili değil.");
    const retryButton = screen.getByRole("button", { name: /tekrar dene/i });
    await userEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <CloudTaskList
        tasks={[]}
        today="2026-08-24"
        loading={false}
        error={{ kind: "network", message: "Bağlantı hatası." }}
        onToggle={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Bağlantı hatası.");
  });

  it("shows a non-blocking error banner above a stale list instead of hiding the tasks", () => {
    render(
      <CloudTaskList
        tasks={[task]}
        today="2026-08-24"
        loading={false}
        error={{ kind: "network", message: "Görevler yenilenemedi." }}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Görevler yenilenemedi.");
    expect(screen.getByText("Present perfect tekrar et")).toBeInTheDocument();
  });

  it("renders every task in the list", () => {
    const second: CloudTask = { ...task, id: "t2", title: "Past perfect tekrar et" };
    render(<CloudTaskList tasks={[task, second]} today="2026-08-24" loading={false} error={null} onToggle={vi.fn()} />);
    expect(screen.getByText("Present perfect tekrar et")).toBeInTheDocument();
    expect(screen.getByText("Past perfect tekrar et")).toBeInTheDocument();
  });
});
