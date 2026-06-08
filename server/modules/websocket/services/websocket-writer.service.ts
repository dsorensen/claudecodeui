import { WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import type { RealtimeClientConnection } from '@/shared/types.js';

/**
 * Bounded number of events retained for replay on reconnect. Caps memory per
 * run while still covering the streaming chunks plus the terminal event.
 */
const REPLAY_BUFFER_MAX = 2000;

/**
 * Thin transport adapter that gives WebSocket connections the same interface as
 * SSE writers used by API routes (`send`, `setSessionId`, `getSessionId`).
 */
export class WebSocketWriter {
  ws: RealtimeClientConnection;
  sessionId: string | null;
  userId: string | number | null;
  isWebSocketWriter: boolean;
  /**
   * Bounded ring of events emitted during this run, replayed to the new socket
   * on `updateWebSocket()`. Without it, losing the socket mid-response (page
   * refresh, mobile tab suspend, flaky network) drops events sent while it was
   * closed — including the terminal `complete`/`error` — leaving the UI stuck
   * on "Processing" forever (DEV-56).
   */
  replayBuffer: unknown[];

  constructor(ws: RealtimeClientConnection, userId: string | number | null = null) {
    this.ws = ws;
    this.sessionId = null;
    this.userId = userId;
    this.isWebSocketWriter = true;
    this.replayBuffer = [];
  }

  send(data: unknown): void {
    // Always buffer so a reconnecting client can replay anything it missed.
    this.replayBuffer.push(data);
    if (this.replayBuffer.length > REPLAY_BUFFER_MAX) {
      this.replayBuffer.shift();
    }
    if (this.ws.readyState === WS_OPEN_STATE) {
      this.ws.send(JSON.stringify(data));
    }
  }

  updateWebSocket(newRawWs: RealtimeClientConnection): void {
    this.ws = newRawWs;
    // Flush buffered events so the client catches up on everything that
    // streamed while it was disconnected, including any terminal event that
    // unblocks its UI. Skip (keeping the buffer intact) if the new socket is
    // not open yet, so a failed reconnect doesn't drop the missed events.
    if (newRawWs.readyState !== WS_OPEN_STATE) return;
    for (const data of this.replayBuffer) {
      try {
        newRawWs.send(JSON.stringify(data));
      } catch {
        // Best-effort replay; a failed write is not fatal.
      }
    }
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
