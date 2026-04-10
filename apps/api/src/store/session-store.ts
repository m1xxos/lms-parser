import { v4 as uuid } from "uuid";
import { Redis } from "ioredis";
import { MoodleSession } from "../types.js";
import { config } from "../config.js";
import { encryptString } from "../utils/crypto.js";

class SessionStore {
  private readonly fallbackSessions = new Map<string, MoodleSession>();
  private readonly redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null
  });
  private readonly keyPrefix = "lms:session:";

  private buildKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  async create(payload: {
    baseUrl: string;
    userId: number;
    userFullName: string;
    siteName: string;
    version: string;
    token: string;
  }): Promise<MoodleSession> {
    const id = uuid();
    const session: MoodleSession = {
      id,
      baseUrl: payload.baseUrl,
      userId: payload.userId,
      userFullName: payload.userFullName,
      siteName: payload.siteName,
      version: payload.version,
      tokenEncrypted: encryptString(payload.token),
      createdAt: new Date().toISOString()
    };

    this.fallbackSessions.set(id, session);

    try {
      await this.redis.set(this.buildKey(id), JSON.stringify(session), "EX", config.sessionTtlSeconds);
    } catch (error) {
      console.error(`Failed to persist session ${id} in Redis.`, error);
    }

    return session;
  }

  async get(sessionId: string): Promise<MoodleSession | null> {
    try {
      const raw = await this.redis.get(this.buildKey(sessionId));
      if (raw) {
        const session = JSON.parse(raw) as MoodleSession;
        this.fallbackSessions.set(sessionId, session);
        await this.redis.expire(this.buildKey(sessionId), config.sessionTtlSeconds);
        return session;
      }
    } catch (error) {
      console.error(`Failed to read session ${sessionId} from Redis.`, error);
    }

    return this.fallbackSessions.get(sessionId) ?? null;
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

export const sessionStore = new SessionStore();
