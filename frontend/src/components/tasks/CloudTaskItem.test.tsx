import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CloudTaskItem from "@/components/tasks/CloudTaskItem";
import type { CloudTask } from "@/types/task";

const todoTask: CloudTask = {
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

describe("CloudTaskItem", () => {
  it("renders title, description, subject and source_skill", () => {
    render(<CloudTaskItem task={todoTask} today="2026-08-24" onToggle={vi.fn()} />);
    expect(screen.getByText("Present perfect tekrar et")).toBeInTheDocument();
    expect(screen.getByText("20 soru çöz")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("english-teacher")).toBeInTheDocument();
  });

  it("shows a checkbox reflecting todo status", () => {
    render(<CloudTaskItem task={todoTask} today="2026-08-24" onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("shows a checkbox reflecting done status", () => {
    render(<CloudTaskItem task={{ ...todoTask, status: "done" }} today="2026-08-24" onToggle={vi.fn()} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("calls onToggle with the task when the checkbox is clicked", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<CloudTaskItem task={todoTask} today="2026-08-24" onToggle={onToggle} />);

    await userEvent.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(todoTask);
  });

  it("disables the checkbox while a toggle is in flight and re-enables after", async () => {
    let resolveToggle: () => void = () => {};
    const onToggle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    render(<CloudTaskItem task={todoTask} today="2026-08-24" onToggle={onToggle} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);
    expect(checkbox).toBeDisabled();

    resolveToggle();
    await screen.findByRole("checkbox", { name: /./ });
    expect(screen.getByRole("checkbox")).not.toBeDisabled();
  });

  it("ignores a second click while the first toggle is still in flight", async () => {
    let resolveToggle: () => void = () => {};
    const onToggle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    render(<CloudTaskItem task={todoTask} today="2026-08-24" onToggle={onToggle} />);

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);
    await userEvent.click(checkbox); // disabled — should not fire a second call
    resolveToggle();

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
