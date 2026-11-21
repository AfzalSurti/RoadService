import type { Issue } from "../types";

/** Defect workflow in words (agreed naming):
 * Completed - pending verification by GMC -> Verified by GMC - pending verification by NHIPMPL
 * -> Verified - closed. */
export function defectStage(i: Pick<Issue, "status"> & { stage?: string | null; gmc_verified?: boolean }) {
  if (i.stage) return i.stage;
  switch (i.status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "under_review":
      return "Rework required";
    case "completed":
      return "Completed - pending verification by GMC";
    case "verification_pending":
      return i.gmc_verified ? "Verified by GMC - pending verification by NHIPMPL" : "Pending verification by GMC";
    case "closed":
      return "Verified - closed";
    default:
      return String(i.status);
  }
}

/** Audit-trail heading for one history entry. */
export function historyStage(h: { from_status: string | null; to_status: string; note: string | null }) {
  const note = h.note || "";
  if (note.startsWith("Verified by GMC")) return "Verified by GMC - pending verification by NHIPMPL";
  if (note.startsWith("Verified by NHIPMPL")) return "Verified by NHIPMPL - closed";
  if (h.from_status === h.to_status) return "Update";
  return defectStage({ status: h.to_status as Issue["status"], gmc_verified: false });
}

/** The six workflow steps (as agreed with NHIPMPL) and how far a defect has got:
 * returns the index of the current step; steps before it are done. */
export const WORKFLOW_STEPS = [
  "Completed",
  "Pending verification by GMC",
  "Verified by GMC",
  "Pending verification by NHIPMPL",
  "Verified",
  "Closed",
];

export function workflowIndex(i: Pick<Issue, "status"> & { gmc_verified?: boolean }): number {
  switch (i.status) {
    case "completed":
      return 1;
    case "verification_pending":
      return i.gmc_verified ? 3 : 1;
    case "closed":
      return WORKFLOW_STEPS.length;
    default:
      return -1; // open / in progress / rework: work not completed yet
  }
}
