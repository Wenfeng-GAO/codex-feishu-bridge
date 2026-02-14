export class ChatSerialQueue {
  private chains = new Map<string, Promise<void>>();

  enqueue<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(chatId) ?? Promise.resolve();

    let resolveOut: (v: T) => void;
    let rejectOut: (e: unknown) => void;
    const out = new Promise<T>((resolve, reject) => {
      resolveOut = resolve;
      rejectOut = reject;
    });

    const next = prev
      .catch(() => {
        // Don't block the chain if the previous task failed.
      })
      .then(async () => {
        try {
          const v = await fn();
          resolveOut!(v);
        } catch (e) {
          rejectOut!(e);
        }
      })
      .finally(() => {
        // Only delete if we're still the tail.
        if (this.chains.get(chatId) === next) this.chains.delete(chatId);
      });

    this.chains.set(chatId, next);
    return out;
  }
}

