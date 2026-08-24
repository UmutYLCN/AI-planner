"use client";

/**
 * Locks this route behind the single owner Google account.
 *
 * Purely additive: the pages underneath are untouched. Before Firebase is configured the
 * gate passes through, so the local Dexie roadmap features keep working as they always did.
 */
import OwnerGate from "@/components/auth/OwnerGate";

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <OwnerGate>{children}</OwnerGate>;
}
