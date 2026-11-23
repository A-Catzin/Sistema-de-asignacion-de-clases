export type ConditionalWrite = Readonly<{
  name: string;
  value: unknown;
  updateTime: string | null;
}>;

export type FirestoreStats = Readonly<{
  reads: number;
  listCalls: number;
  writes: number;
  commits: number;
  abortedCommits: number;
  maxDocumentBytes: number;
}>;

export type ListedDocument<Value> = Readonly<{
  id: string;
  name: string;
  value: Value;
  updateTime: string;
}>;

const projectId = 'demo-assignment-integrity';
const firestoreBatchWriteLimit = 500;

export function encodeKey(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

function extractStringPayload(document: { fields?: Record<string, { stringValue?: string }> }): string {
  const raw = document.fields?.data?.stringValue ?? document.fields?.assignments?.stringValue;
  if (typeof raw !== 'string') {
    throw new Error('Emulator document does not contain a serialized string payload.');
  }
  return raw;
}

export function createLocalFirestore(host: string, scenarioId: string) {
  if (!/^(?:127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}$/.test(host)) {
    throw new Error('An explicit loopback Firestore emulator address is required.');
  }
  if (!/^[a-zA-Z0-9-]+$/.test(scenarioId)) {
    throw new Error('Invalid scenario ID.');
  }

  const documents = `projects/${projectId}/databases/(default)/documents`;
  const name = `${documents}/assignmentScenarios/${scenarioId}`;
  const base = `http://${host}/v1`;

  let reads = 0;
  let listCalls = 0;
  let writesCount = 0;
  let commits = 0;
  let abortedCommits = 0;
  let maxDocumentBytes = 0;

  function recordBytes(bytes: number) {
    if (bytes > maxDocumentBytes) {
      maxDocumentBytes = bytes;
    }
  }

  function request(path: string, body?: object) {
    return fetch(`${base}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function read<Value>(path: string): Promise<{ value: Value; updateTime: string; rawBytes: number } | null> {
    reads += 1;
    const response = await request(path);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Emulator read failed (${response.status}).`);
    const document = await response.json();
    const raw = extractStringPayload(document);
    const rawBytes = Buffer.byteLength(raw, 'utf8');
    recordBytes(rawBytes);
    return { value: JSON.parse(raw) as Value, updateTime: document.updateTime, rawBytes };
  }

  async function list<Value>(collectionPath: string): Promise<Array<ListedDocument<Value>>> {
    const results: Array<ListedDocument<Value>> = [];
    let pageToken: string | undefined;

    do {
      listCalls += 1;
      const query = pageToken
        ? `pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`
        : 'pageSize=1000';
      const response = await request(`${collectionPath}?${query}`);
      if (response.status === 404) {
        reads += 1;
        return results;
      }
      if (!response.ok) throw new Error(`Emulator list failed (${response.status}).`);

      const payload = (await response.json()) as {
        documents?: Array<{ name: string; updateTime: string; fields?: Record<string, { stringValue?: string }> }>;
        nextPageToken?: string;
      };
      const docs = payload.documents ?? [];
      reads += Math.max(1, docs.length);

      for (const doc of docs) {
        const raw = extractStringPayload(doc);
        recordBytes(Buffer.byteLength(raw, 'utf8'));
        results.push({
          id: doc.name.split('/').pop() ?? '',
          name: doc.name,
          value: JSON.parse(raw) as Value,
          updateTime: doc.updateTime,
        });
      }
      pageToken = payload.nextPageToken;
    } while (pageToken);

    return results;
  }

  async function commit(writes: readonly ConditionalWrite[]): Promise<boolean> {
    if (writes.length > firestoreBatchWriteLimit) {
      throw new Error(`Commit exceeds Firestore ${firestoreBatchWriteLimit}-write limit (${writes.length}).`);
    }
    commits += 1;
    const serializedWrites = writes.map(({ name: writeName, value, updateTime }) => {
      const serialized = JSON.stringify(value);
      recordBytes(Buffer.byteLength(serialized, 'utf8'));
      return {
        update: { name: writeName, fields: { data: { stringValue: serialized } } },
        currentDocument: updateTime === null ? { exists: false } : { updateTime },
      };
    });

    const response = await request(`${documents}:commit`, { writes: serializedWrites });
    if (response.ok) {
      writesCount += writes.length;
      return true;
    }

    const status = (await response.json()).error?.status;
    if (
      status === 'ABORTED' ||
      status === 'FAILED_PRECONDITION' ||
      (status === 'ALREADY_EXISTS' && writes.some((item) => item.updateTime === null))
    ) {
      abortedCommits += 1;
      return false;
    }
    throw new Error(`Emulator commit failed (${response.status}, ${status ?? 'unknown'}).`);
  }

  function stats(): FirestoreStats {
    return {
      reads,
      listCalls,
      writes: writesCount,
      commits,
      abortedCommits,
      maxDocumentBytes,
    };
  }

  return { documents, name, read, list, commit, stats };
}
