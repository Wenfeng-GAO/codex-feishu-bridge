import type { BridgeConfig } from '../config.js';
import type { Inbound } from '../feishu/types.js';
import type { Store } from '../store/db.js';
import type { RunCodexAdapter, SendAdapter } from './handle.js';
import { handleInbound } from './handle.js';
import { ChatSerialQueue } from './queue.js';

export class InboundDispatcher {
  private q = new ChatSerialQueue();

  constructor(
    private deps: {
      cfg: BridgeConfig;
      store: Store;
      runCodex: RunCodexAdapter;
      send: SendAdapter;
      renderMode?: 'raw' | 'card' | 'auto';
      textChunkLimit?: number;
    },
  ) {}

  dispatch(inbound: Inbound): Promise<void> {
    return this.q.enqueue(inbound.chat_id, async () => {
      await handleInbound({ ...this.deps, inbound });
    });
  }
}

