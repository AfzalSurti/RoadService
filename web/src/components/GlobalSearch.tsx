import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "./StatusBadge";
import { projectShortName, setSelectedProjectId, usePackageScope } from "../lib/projectScope";
import type { DocumentFolder, Project } from "../types";

type Hit = {
  kind: string;
  title: string;
  subtitle?: string;
  to: string;
  /** Package the target belongs to: opening it switches the sidebar scope if needed. */
  projectId?: number | null;
  haystack: string;
};

const KIND_ORDER = [
  "Pages",
  "Packages",
  "Issues",
  "RFIs",
  "Queries",
  "Vendors",
  "Documents",
  "Folders",
  "Inventory sheets",
  "BOQ items",
  "Invoices",
  "Staff",
];
const PER_KIND = 6;
const REFRESH_MS = 2 * 60 * 1000;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function hit(kind: string, title: string, to: string, extra: (string | null | undefined)[] = [], subtitle?: string, projectId?: number | null): Hit {
  return { kind, title, to, subtitle, projectId, haystack: norm([title, subtitle, ...extra].filter(Boolean).join(" ")) };
}

/** Sidebar sections the current role can open (same rules as the sidebar). */
function pageHits(role: string | null): Hit[] {
  const staff = role === "admin" || role === "contractor" || role === "government";
  const adminGov = role === "admin" || role === "government";
  const billing = staff;
  const pages: [boolean, string, string, string][] = [
    [true, "Dashboard", "/dashboard", "home packages overview"],
    [staff, "Project Inventory", "/civil-assets", "inventory location scope junction bridge culvert sign board"],
    [true, "Issues", "/issues", "defects potholes complaints"],
    [staff, "RFI — Request for Inspection", "/rfi", "inspection request rfi"],
    [staff, "NSR", "/mpr", "mpr monthly progress report nsr"],
    [staff, "Project Overview", "/executive", "executive summary stretch"],
    [adminGov, "Vendors", "/vendors", "agency work order loa contractor"],
    [true, "Map", "/map", "location gps pins"],
    [staff, "Toll Ops", "/toll", "toll plaza collection"],
    [staff, "Incidents", "/highway-incidents", "accident highway incident"],
    [staff, "ATMS / TMS / ITS", "/its", "toll plaza performance atms tms its"],
    [adminGov, "Integrations", "/integrations", "integration sync"],
    [adminGov, "Backup / DR", "/backup-dr", "backup disaster recovery"],
    [true, "Staff Details", "/staff-details", "staff professionals employees"],
    [staff, "Query Raise", "/queries", "ticket query support"],
    [adminGov, "GMC Billing", "/billing", "invoice bill payment"],
    [billing, "Contractor Billing", "/contractor-billing", "invoice bill contractor payment"],
    [staff, "Documents & Approvals", "/documents", "documents files folders approvals"],
    [adminGov, "Attendance", "/attendance", "attendance leave roster"],
    [staff, "Security", "/security", "audit login security"],
    [true, "Notifications", "/notifications", "alerts notifications"],
    [true, "Reports", "/reports", "daily weekly excel report"],
    [adminGov, "Projects", "/projects", "packages projects edit"],
    [adminGov, "BOQ", "/rates", "boq rates bills quantity"],
    [role === "admin", "Users", "/users", "users logins accounts"],
  ];
  return pages.filter(([ok]) => ok).map(([, title, to, words]) => hit("Pages", title, to, [words]));
}

function flattenFolders(nodes: DocumentFolder[], trail: string[] = []): { folder: DocumentFolder; path: string }[] {
  return nodes.flatMap((n) => [
    { folder: n, path: [...trail, n.name].join(" / ") },
    ...flattenFolders(n.children || [], [...trail, n.name]),
  ]);
}

async function buildIndex(token: string, role: string | null): Promise<Hit[]> {
  const staff = role === "admin" || role === "contractor" || role === "government";
  const adminGov = role === "admin" || role === "government";
  const settle = async <T,>(on: boolean, fn: () => Promise<T>): Promise<T | null> => {
    if (!on) return null;
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const projects = (await settle(true, () => api.projects(token))) || [];
  const pname = (id: number | null | undefined) => {
    const p = projects.find((x) => x.id === id);
    return p ? projectShortName(p) : "";
  };
  const [issues, rfis, queries, vendors, docs, folders, staffRows, invoices, rates, sheets] = await Promise.all([
    settle(true, () => api.issues(token, null, null)),
    settle(staff, () => api.rfis(token)),
    settle(staff, () => api.queries(token)),
    settle(staff, () => api.vendors(token)),
    settle(staff, () => api.documents(token)),
    settle(staff, () => api.documentFolders(token)),
    settle(true, () => api.staffDetails(token)),
    settle(adminGov, () => api.invoices(token)),
    settle(staff, () => api.rateItems(token)),
    settle(staff, () =>
      Promise.all(projects.map((p: Project) => api.inventorySheets(token, p.id).then((s) => ({ p, s })).catch(() => ({ p, s: [] }))))
    ),
  ]);

  const out: Hit[] = [...pageHits(role)];
  for (const p of projects) {
    out.push(
      hit("Packages", projectShortName(p), `/dashboard?project=${p.id}`, [p.name, p.title, p.location, p.concessionaire], p.title || p.location, p.id)
    );
  }
  for (const i of issues || []) {
    out.push(
      hit(
        "Issues",
        `#${i.id} · ${i.issue_type_label || i.issue_type}`,
        `/issues?project=${i.project_id}&id=${i.id}`,
        [String(i.id), i.description, i.work_category_label, i.issue_type],
        [pname(i.project_id), i.chainage, formatLabel(i.status)].filter(Boolean).join(" · "),
        i.project_id
      )
    );
  }
  for (const r of rfis || []) {
    out.push(
      hit("RFIs", `${r.rfi_no} · ${r.subject}`, `/rfi?project=${r.project_id}&id=${r.id}`, [r.description, r.ae_name, r.contractor_name, r.category], [pname(r.project_id), formatLabel(r.status)].filter(Boolean).join(" · "), r.project_id)
    );
  }
  for (const q of queries || []) {
    out.push(
      hit("Queries", `${q.ticket_no} · ${q.subject}`, `/queries?id=${q.id}`, [q.description, q.module_area], [pname(q.project_id), formatLabel(q.status)].filter(Boolean).join(" · "), q.project_id)
    );
  }
  for (const v of vendors || []) {
    out.push(hit("Vendors", v.name, `/vendors?id=${v.id}`, [v.type_of_work, v.brief, v.remarks], [pname(v.project_id), v.type_of_work].filter(Boolean).join(" · ")));
  }
  const folderList = flattenFolders(folders || []);
  const folderPath = new Map(folderList.map((f) => [f.folder.id, f.path]));
  for (const d of docs || []) {
    const path = d.folder_id ? folderPath.get(d.folder_id) : "";
    out.push(
      hit("Documents", d.title, d.folder_id ? `/documents?folder=${d.folder_id}&doc=${d.id}` : "/documents", [d.description, d.category], path || pname(d.project_id), d.project_id)
    );
  }
  for (const { folder, path } of folderList) {
    out.push(hit("Folders", folder.name, `/documents?folder=${folder.id}`, [path], path, folder.project_id));
  }
  for (const { p, s } of sheets || []) {
    for (const sh of s) {
      out.push(hit("Inventory sheets", sh.name, `/civil-assets?project=${p.id}&sheet=${sh.id}`, [p.name], `${projectShortName(p)} · Project Inventory`, p.id));
    }
  }
  for (const r of rates || []) {
    if (!("rate" in r)) continue;
    out.push(hit("BOQ items", `${r.item_no} · ${r.description}`, `/rates?project=${r.project_id}`, [r.unit, r.remarks], pname(r.project_id), r.project_id));
  }
  for (const inv of invoices || []) {
    out.push(
      hit("Invoices", `${inv.transaction_id} · ${inv.invoice_no}`, "/billing", [inv.contractor_name, inv.project_title], [pname(inv.project_id), formatLabel(String(inv.status))].filter(Boolean).join(" · "), inv.project_id)
    );
  }
  for (const s of staffRows || []) {
    out.push(hit("Staff", s.name, "/staff-details", [s.position, s.project_name, s.organization_label, s.email_id, s.mobile_no], [s.position, s.project_name].filter(Boolean).join(" · ")));
  }
  return out;
}

function score(h: Hit, q: string, terms: string[]): number {
  const title = norm(h.title);
  if (!terms.every((t) => h.haystack.includes(t))) return 0;
  let s = 1;
  if (title === q) s += 100;
  if (title.startsWith(q)) s += 50;
  if (title.includes(q)) s += 20;
  if (h.kind === "Pages") s += 5;
  return s;
}

/**
 * Portal-wide search in the top bar (Ctrl+K): sections, packages, issues, RFIs,
 * queries, vendors, documents, folders, inventory sheets, BOQ, invoices, staff.
 * A result opens the exact place (issue panel, RFI, folder, sheet tab…).
 */
export function GlobalSearch() {
  const { token, role } = useAuth();
  const navigate = useNavigate();
  const { inScope } = usePackageScope();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const builtAt = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const ensureIndex = () => {
    if (!token || loading || (index && Date.now() - builtAt.current < REFRESH_MS)) return;
    setLoading(true);
    buildIndex(token, role)
      .then((h) => {
        setIndex(h);
        builtAt.current = Date.now();
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
        ensureIndex();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  });

  const groups = useMemo(() => {
    const query = norm(q);
    if (!query || !index) return [] as [string, Hit[]][];
    const terms = query.split(" ");
    const ranked = index
      .map((h) => ({ h, s: score(h, query, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const byKind = new Map<string, Hit[]>();
    for (const { h } of ranked) {
      const list = byKind.get(h.kind) || [];
      if (list.length < PER_KIND) list.push(h);
      byKind.set(h.kind, list);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => [k, byKind.get(k)!] as [string, Hit[]]);
  }, [q, index]);
  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups]);

  useEffect(() => setCursor(0), [q]);

  const go = (h: Hit) => {
    // Make sure the sidebar package scope does not hide what was searched for.
    if (h.projectId && !inScope(h.projectId)) setSelectedProjectId(h.projectId);
    setOpen(false);
    setQ("");
    input.current?.blur();
    // A package opens its dashboard directly (no photo splash) when picked here.
    navigate(h.to, h.kind === "Packages" ? { state: { skipHero: true } } : undefined);
  };

  return (
    <div className="global-search" ref={box}>
      <input
        ref={input}
        type="search"
        value={q}
        placeholder="Search the portal…  (Ctrl+K)"
        aria-label="Search the portal"
        onFocus={() => {
          setOpen(true);
          ensureIndex();
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, flat.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && flat[cursor]) {
            e.preventDefault();
            go(flat[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          }
        }}
      />
      {open && q.trim() ? (
        <div className="global-search-results" role="listbox">
          {loading && !index ? <p className="muted global-search-note">Loading portal data…</p> : null}
          {index && !flat.length ? <p className="muted global-search-note">No matches for “{q.trim()}”.</p> : null}
          {groups.map(([kind, list]) => (
            <div key={kind} className="global-search-group">
              <div className="global-search-kind">{kind}</div>
              {list.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <button
                    key={`${h.kind}-${h.to}-${h.title}`}
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={`global-search-item${i === cursor ? " active" : ""}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(h)}
                  >
                    <span className="global-search-title">{h.title}</span>
                    {h.subtitle ? <span className="global-search-sub">{h.subtitle}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
