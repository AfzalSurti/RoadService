import type { IssueStatus } from "../types";

const LABELS: Record<IssueStatus, string> = {
  open: "To Do",
  in_progress: "In Progress",
  completed: "Completed",
  verification_pending: "Verification Pending",
  under_review: "Under Review / Rework",
  closed: "Closed",
};

export function StatusBadge({ status }: { status: IssueStatus | string }) {
  const key = status as IssueStatus;
  return <span className={`badge status-${status}`}>{LABELS[key] || status.replaceAll("_", " ")}</span>;
}

export function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}
