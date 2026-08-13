/** Corridor packages used across Warnings / PMM / Critical Issues. */
export const PACKAGE_NAMES = [
  "Jabalpur - Lakhnadon",
  "Lakhnadon - Khawasa",
  "Bokhedi - Kelapur",
] as const;

export type PackageName = (typeof PACKAGE_NAMES)[number];

/** Match DB projects to package stretch names (exact or contains). */
export function matchProjectsToPackages<T extends { id: number; name: string }>(
  projects: T[],
  selected: string[]
): T[] {
  const hits: T[] = [];
  for (const pkg of selected) {
    const found =
      projects.find((p) => p.name.trim().toLowerCase() === pkg.toLowerCase()) ||
      projects.find((p) => p.name.toLowerCase().includes(pkg.toLowerCase().split(" - ")[0] || pkg));
    if (found && !hits.some((h) => h.id === found.id)) hits.push(found);
  }
  return hits;
}
