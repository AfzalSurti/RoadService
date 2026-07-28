import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const KEY = "roadservice_offline_queue";

export type OfflineJob = {
  id: string;
  type: "create" | "complete";
  issueId?: number;
  photoUri: string;
  fields: Record<string, string>;
  createdAt: string;
};

async function readQueue(): Promise<OfflineJob[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineJob[];
  } catch {
    return [];
  }
}

async function writeQueue(jobs: OfflineJob[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
}

export async function enqueueOfflineJob(job: Omit<OfflineJob, "id" | "createdAt">) {
  const jobs = await readQueue();
  jobs.push({
    ...job,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(jobs);
  return jobs.length;
}

export async function listOfflineJobs() {
  return readQueue();
}

export async function flushOfflineJobs(token: string): Promise<{ synced: number; failed: number }> {
  const jobs = await readQueue();
  if (!jobs.length) return { synced: 0, failed: 0 };
  const remaining: OfflineJob[] = [];
  let synced = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const form = new FormData();
      form.append("photo", {
        uri: job.photoUri,
        name: "offline.jpg",
        type: "image/jpeg",
      } as any);
      for (const [k, v] of Object.entries(job.fields)) {
        form.append(k, v);
      }
      if (job.type === "create") {
        await api.createIssue(token, form);
      } else if (job.type === "complete" && job.issueId) {
        await api.completeIssue(token, job.issueId, form);
      }
      synced += 1;
    } catch {
      remaining.push(job);
      failed += 1;
    }
  }
  await writeQueue(remaining);
  return { synced, failed };
}

export function isNetworkError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /network|failed to fetch|offline|timeout|internet/i.test(msg) || msg === "Network request failed";
}
