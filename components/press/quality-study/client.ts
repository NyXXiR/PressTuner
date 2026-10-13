import type { Command, ReportResponse, StudySummary } from "./adapter";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Pending = { path: string; body: Record<string, unknown> };
const root = "/api/press/quality-studies";
// No model call or report exposure on mount. Ambiguous POSTs require explicit
// replay of the same key; a new user choice is blocked until it is resolved.
export class StudyClient {
  current: StudySummary | null = null;
  pending: Pending | null = null;
  busy = false;
  constructor(private key: string, private fetcher: typeof fetch = fetch, private storage?: StoragePort) {
    this.fetcher = fetcher.bind(globalThis);
    try {
      const saved = JSON.parse(storage?.getItem(`${key}:pending`) ?? "null");
      if (saved && (saved.path === root || /^\/api\/press\/quality-studies\/[\w-]+$/.test(saved.path)) && typeof saved.body?.idempotencyKey === "string") this.pending = saved;
    } catch { /* Browser storage is optional; the server remains authoritative. */ }
  }
  private remember(suffix: string, value: unknown) { try { if (value === null) this.storage?.removeItem(`${this.key}:${suffix}`); else this.storage?.setItem(`${this.key}:${suffix}`, JSON.stringify(value)); } catch { /* Memory still prevents duplicate in-flight operations. */ } }
  get savedId(): string | null { try { const id = JSON.parse(this.storage?.getItem(`${this.key}:selected`) ?? "null"); return typeof id === "string" ? id : null; } catch { return null; } }
  private accept(value: StudySummary) { this.current = value; this.remember("selected", value.id); return value; }
  private async get<T>(path: string): Promise<T> {
    const response = await this.fetcher(path, { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.code ?? `HTTP_${response.status}`);
    return data;
  }
  async list(): Promise<{ id: string; name: string; revision: number }[]> { return (await this.get<{ studies: { id: string; name: string; revision: number }[] }>(root)).studies; }
  async open(id: string) {
    if (this.busy) throw new Error("BUSY");
    if (this.pending && this.pending.path !== `${root}/${encodeURIComponent(id)}`) throw new Error("PENDING_REQUEST");
    this.busy = true;
    try { return this.accept(await this.get<StudySummary>(`${root}/${encodeURIComponent(id)}`)); }
    finally { this.busy = false; }
  }
  async report(): Promise<ReportResponse> {
    if (this.busy || this.pending || !this.current) throw new Error("BUSY");
    this.busy = true;
    try { const result = await this.get<ReportResponse>(`${root}/${encodeURIComponent(this.current.id)}?view=report`); this.current = { ...this.current, revision: result.revision }; return result; }
    finally { this.busy = false; }
  }
  async create(name: string) { return this.write({ path: root, body: { name, idempotencyKey: crypto.randomUUID() } }); }
  async send(command: Command) {
    if (this.busy) throw new Error("BUSY");
    if (this.pending) throw new Error("PENDING_REQUEST");
    if (!this.current) throw new Error("STUDY_REQUIRED");
    return this.write({ path: `${root}/${encodeURIComponent(this.current.id)}`, body: { ...command, expectedRevision: this.current.revision, idempotencyKey: crypto.randomUUID() } });
  }
  async retry() {
    if (!this.pending) throw new Error("NO_PENDING_REQUEST");
    return this.write(this.pending, true);
  }
  private async write(request: Pending, retry = false) {
    if (this.busy) throw new Error("BUSY");
    if (this.pending && !retry) throw new Error("PENDING_REQUEST");
    this.busy = true; this.pending = request; this.remember("pending", request);
    try {
      const response = await this.fetcher(request.path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          this.pending = null; this.remember("pending", null);
          if (response.status === 409 && this.current) this.accept(await this.get<StudySummary>(`${root}/${encodeURIComponent(this.current.id)}`));
        }
        throw new Error(data.code ?? `HTTP_${response.status}`);
      }
      this.pending = null; this.remember("pending", null);
      return this.accept(data);
    } catch (error) {
      if (this.pending) throw new Error("AMBIGUOUS_SAVE", { cause: error });
      throw error;
    } finally { this.busy = false; }
  }
}
