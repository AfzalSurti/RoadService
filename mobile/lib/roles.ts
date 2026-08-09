/** Display labels for roles (API values stay admin/government/surveyor/contractor). */
export const ROLE_LABELS: Record<string, string> = {
  admin: "GMC Experts (MIS Expert)",
  government: "NHIPMPL representative",
  surveyor: "GMC representative",
  contractor: "Contractor",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABELS[role] || role.replace(/_/g, " ");
}
