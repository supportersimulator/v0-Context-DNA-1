'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageMetadata {
  model?: string;
  tokens?: number;
  latency_ms?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: ChatMessageMetadata;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'contextdna_chat';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_SESSIONS = 'sessions';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Thin IndexedDB promise wrapper
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessions.createIndex('by_updated', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const messages = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        messages.createIndex('by_session_ts', ['session_id', 'timestamp'], { unique: false });
      }
    };
  });
}

function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// ---------------------------------------------------------------------------
// ChatStore (singleton)
// ---------------------------------------------------------------------------

export class ChatStore {
  private static instance: ChatStore | null = null;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): ChatStore {
    if (!ChatStore.instance) {
      ChatStore.instance = new ChatStore();
    }
    return ChatStore.instance;
  }

  // --- lifecycle -----------------------------------------------------------

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.db = await openDB();
    })();
    return this.initPromise;
  }

  private getDB(): IDBDatabase {
    if (!this.db) throw new Error('ChatStore not initialized — call init() first');
    return this.db;
  }

  // --- sessions ------------------------------------------------------------

  async createSession(title?: string, model?: string): Promise<ChatSession> {
    const db = this.getDB();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: title ?? 'New conversation',
      created_at: Date.now(),
      updated_at: Date.now(),
      message_count: 0,
      model: model ?? 'synaptic',
    };
    const t = tx(db, STORE_SESSIONS, 'readwrite');
    t.objectStore(STORE_SESSIONS).put(session);
    await txDone(t);
    return session;
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const db = this.getDB();
    const t = tx(db, STORE_SESSIONS, 'readonly');
    const result = await req<ChatSession | undefined>(
      t.objectStore(STORE_SESSIONS).get(id),
    );
    return result ?? null;
  }

  async listSessions(limit = 50, offset = 0): Promise<ChatSession[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_SESSIONS, 'readonly');
      const index = t.objectStore(STORE_SESSIONS).index('by_updated');
      const results: ChatSession[] = [];
      let skipped = 0;

      const cursorReq = index.openCursor(null, 'prev'); // newest first
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }
        results.push(cursor.value as ChatSession);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.getDB();
    const t = tx(db, [STORE_SESSIONS, STORE_MESSAGES], 'readwrite');
    t.objectStore(STORE_SESSIONS).delete(id);

    // Delete all messages belonging to this session via index cursor
    const index = t.objectStore(STORE_MESSAGES).index('by_session_ts');
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
    const cursorReq = index.openCursor(range);
    await new Promise<void>((resolve, reject) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { resolve(); return; }
        cursor.delete();
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    await txDone(t);
  }

  // --- messages ------------------------------------------------------------

  async addMessage(
    sessionId: string,
    role: ChatMessage['role'],
    content: string,
    metadata?: ChatMessageMetadata,
  ): Promise<ChatMessage> {
    const db = this.getDB();
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    const t = tx(db, [STORE_MESSAGES, STORE_SESSIONS], 'readwrite');
    t.objectStore(STORE_MESSAGES).put(msg);

    // Bump session counters
    const sessionReq = t.objectStore(STORE_SESSIONS).get(sessionId);
    await new Promise<void>((resolve, reject) => {
      sessionReq.onsuccess = () => {
        const session = sessionReq.result as ChatSession | undefined;
        if (session) {
          session.message_count += 1;
          session.updated_at = Date.now();
          t.objectStore(STORE_SESSIONS).put(session);
        }
        resolve();
      };
      sessionReq.onerror = () => reject(sessionReq.error);
    });

    await txDone(t);
    return msg;
  }

  async getMessages(
    sessionId: string,
    limit = 100,
    before?: number,
  ): Promise<ChatMessage[]> {
    const db = this.getDB();
    const upperTs = before ?? Number.MAX_SAFE_INTEGER;
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_MESSAGES, 'readonly');
      const index = t.objectStore(STORE_MESSAGES).index('by_session_ts');
      const range = IDBKeyRange.bound([sessionId, 0], [sessionId, upperTs]);
      const results: ChatMessage[] = [];

      // Walk backwards (newest first), then reverse at the end for chronological order
      const cursorReq = index.openCursor(range, 'prev');
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || results.length >= limit) {
          results.reverse();
          resolve(results);
          return;
        }
        // Exclude the exact 'before' timestamp to avoid duplication on pagination
        const msg = cursor.value as ChatMessage;
        if (before !== undefined && msg.timestamp >= before) {
          cursor.continue();
          return;
        }
        results.push(msg);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async getLastMessage(sessionId: string): Promise<ChatMessage | null> {
    const msgs = await this.getMessages(sessionId, 1);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  // --- maintenance ---------------------------------------------------------

  async clearOldSessions(maxAge: number = THIRTY_DAYS_MS): Promise<number> {
    const db = this.getDB();
    const cutoff = Date.now() - maxAge;
    let deleted = 0;

    // Collect session IDs to delete
    const sessionsToDelete: string[] = [];
    const readTx = tx(db, STORE_SESSIONS, 'readonly');
    const index = readTx.objectStore(STORE_SESSIONS).index('by_updated');
    const range = IDBKeyRange.upperBound(cutoff);

    await new Promise<void>((resolve, reject) => {
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { resolve(); return; }
        sessionsToDelete.push((cursor.value as ChatSession).id);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    for (const sid of sessionsToDelete) {
      await this.deleteSession(sid);
      deleted++;
    }
    return deleted;
  }

  // --- import / export -----------------------------------------------------

  async exportSession(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const messages = await this.getMessages(sessionId, 10_000);
    return JSON.stringify({ session, messages }, null, 2);
  }

  async importSession(json: string): Promise<ChatSession> {
    const data = JSON.parse(json) as { session: ChatSession; messages: ChatMessage[] };
    if (!data.session || !Array.isArray(data.messages)) {
      throw new Error('Invalid chat export format');
    }

    const db = this.getDB();

    // Assign new IDs to avoid collisions
    const newSessionId = crypto.randomUUID();
    const session: ChatSession = {
      ...data.session,
      id: newSessionId,
      message_count: data.messages.length,
      updated_at: Date.now(),
    };

    const t = tx(db, [STORE_SESSIONS, STORE_MESSAGES], 'readwrite');
    t.objectStore(STORE_SESSIONS).put(session);

    for (const msg of data.messages) {
      const newMsg: ChatMessage = {
        ...msg,
        id: crypto.randomUUID(),
        session_id: newSessionId,
      };
      t.objectStore(STORE_MESSAGES).put(newMsg);
    }

    await txDone(t);
    return session;
  }
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

const isServer = typeof window === 'undefined';

/** Lazy-init singleton. Returns null during SSR. */
export function useChatStore(): ChatStore | null {
  const [store, setStore] = useState<ChatStore | null>(null);

  useEffect(() => {
    if (isServer) return;
    const instance = ChatStore.getInstance();
    instance.init().then(() => setStore(instance));
  }, []);

  return store;
}

/** Manages messages for a single session with auto-scroll support. */
export function useChatSession(sessionId: string | null) {
  const store = useChatStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load messages when sessionId or store changes
  useEffect(() => {
    if (!store || !sessionId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    store.getMessages(sessionId).then((msgs) => {
      setMessages(msgs);
      setIsLoading(false);
    });
  }, [store, sessionId]);

  // Auto-scroll when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback(
    async (
      role: ChatMessage['role'],
      content: string,
      metadata?: ChatMessageMetadata,
    ): Promise<ChatMessage | null> => {
      if (!store || !sessionId) return null;
      const msg = await store.addMessage(sessionId, role, content, metadata);
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [store, sessionId],
  );

  const loadMore = useCallback(
    async (limit = 50): Promise<boolean> => {
      if (!store || !sessionId || messages.length === 0) return false;
      const oldest = messages[0];
      const older = await store.getMessages(sessionId, limit, oldest.timestamp);
      if (older.length === 0) return false;
      setMessages((prev) => [...older, ...prev]);
      return true;
    },
    [store, sessionId, messages],
  );

  return { messages, addMessage, loadMore, isLoading, bottomRef };
}
