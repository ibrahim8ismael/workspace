/** Keeps a durable command's key in memory for explicit retries of the exact same payload. */
export class SubmissionKey {
  private fingerprint: string | null = null;
  private key: string | null = null;

  forPayload(payload: unknown): string {
    const next = JSON.stringify(payload);
    if (!this.key || this.fingerprint !== next) {
      this.fingerprint = next;
      this.key = crypto.randomUUID();
    }
    return this.key;
  }

  clear() {
    this.fingerprint = null;
    this.key = null;
  }
}
