import { set, del, keys, get, createStore } from "idb-keyval";

const uploadStore = createStore("fuse-pending-uploads", "entries");

export interface PendingUpload {
  id: string;
  documentId: number;
  fileName: string;
  blob: ArrayBuffer;
  mimeType: string;
  createdAt: string;
}

export async function savePendingUpload(entry: Omit<PendingUpload, "blob" | "mimeType"> & { file: File }): Promise<void> {
  const ab = await entry.file.arrayBuffer();
  const pending: PendingUpload = {
    id: entry.id,
    documentId: entry.documentId,
    fileName: entry.fileName,
    blob: ab,
    mimeType: entry.file.type || "image/jpeg",
    createdAt: entry.createdAt,
  };
  await set(entry.id, pending, uploadStore);
}

export async function removePendingUpload(id: string): Promise<void> {
  await del(id, uploadStore);
}

export async function getPendingUploads(): Promise<PendingUpload[]> {
  const allKeys = await keys(uploadStore);
  const results: PendingUpload[] = [];
  for (const k of allKeys) {
    const val = await get<PendingUpload>(k, uploadStore);
    if (val) results.push(val);
  }
  return results;
}

export async function clearAllPendingUploads(): Promise<void> {
  const allKeys = await keys(uploadStore);
  for (const k of allKeys) {
    await del(k, uploadStore);
  }
}

const STALE_HOURS = 6;

export function notifyUploadsComplete(count: number) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Photos Uploaded", {
      body: `${count} photo${count === 1 ? " has" : "s have"} been uploaded successfully.`,
      icon: "/favicon.ico",
      tag: "photo-upload-complete",
    });
  } catch {}
}

export function notifyStaleUploads(count: number) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Photos Not Uploaded", {
      body: `${count} photo${count === 1 ? "" : "s"} couldn't finish uploading. Check your Wi-Fi or data connection and reopen the project.`,
      icon: "/favicon.ico",
      tag: "photo-upload-stale",
    });
  } catch {}
}

export async function checkStaleUploads(): Promise<void> {
  const pending = await getPendingUploads();
  if (pending.length === 0) return;
  const now = Date.now();
  const stale = pending.filter(p => {
    const age = now - new Date(p.createdAt).getTime();
    return age > STALE_HOURS * 60 * 60 * 1000;
  });
  if (stale.length > 0) {
    notifyStaleUploads(stale.length);
  }
}
