/**
 * Local-first persistence for the human evaluation corpus.
 *
 * Raw WAV blobs stay in the browser's IndexedDB unless the user explicitly
 * exports them. Keys are scoped by corpus ID + fixture ID so a refreshed
 * 24-fixture session survives intact.
 */

export type StoredRecording = {
  key: string;
  corpusId: string;
  fixtureId: string;
  blob: Blob;
  capturedAt: string;
  durationMs: number;
  groundTruthHash: string;
};

const DB_NAME = "certain-eval-corpus";
const STORE_NAME = "recordings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local corpus database."));
  });
}

function keyFor(corpusId: string, fixtureId: string): string {
  return `${corpusId}:${fixtureId}`;
}

export async function groundTruthHash(groundTruth: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(groundTruth));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function saveRecording(input: {
  corpusId: string;
  fixtureId: string;
  blob: Blob;
  capturedAt: string;
  durationMs: number;
  groundTruthHash: string;
}): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ ...input, key: keyFor(input.corpusId, input.fixtureId) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the recording locally."));
    });
  } finally {
    db.close();
  }
}

export async function loadCorpusRecordings(corpusId: string): Promise<StoredRecording[]> {
  const db = await openDb();
  try {
    return await new Promise<StoredRecording[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () =>
        resolve((request.result as StoredRecording[]).filter((item) => item.corpusId === corpusId));
      request.onerror = () => reject(request.error ?? new Error("Could not read local recordings."));
    });
  } finally {
    db.close();
  }
}

export async function clearCorpusRecordings(corpusId: string): Promise<void> {
  const stored = await loadCorpusRecordings(corpusId);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const item of stored) store.delete(item.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear local recordings."));
    });
  } finally {
    db.close();
  }
}
