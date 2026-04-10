import { v4 as uuid } from "uuid";
import { Redis } from "ioredis";
import { MoodleSession } from "../types.js";
import { config } from "../config.js";
import { encryptString } from "../utils/crypto.js";

class SessionStore {
  private readonly fallbackSessions = new Map<string, MoodleSession>();
  private readonly redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true
  });
  private readonly keyPrefix = "lms:session:";

  constructor() {
    this.redis.on("error", (error) => {
      console.error("Redis session-store connection error.", error);
    });
  }

  private async ensureRedisConnected(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

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
      await this.ensureRedisConnected();
      await this.redis.set(this.buildKey(id), JSON.stringify(session), "EX", config.sessionTtlSeconds);
    } catch (error) {
      console.error(`Failed to persist session ${id} in Redis.`, error);
    }

    return session;
  }

  async get(sessionId: string): Promise<MoodleSession | null> {
    try {
      await this.ensureRedisConnected();
      const raw = await this.redis.getex(this.buildKey(sessionId), "EX", config.sessionTtlSeconds);
      if (raw) {
        const session = JSON.parse(raw) as MoodleSession;
        this.fallbackSessions.set(sessionId, session);
        return session;
      }
    } catch (error) {
      console.error(`Failed to read session ${sessionId} from Redis.`, error);
    }

    return this.fallbackSessions.get(sessionId) ?? null;
  }

  async close(): Promise<void> {
    if (this.redis.status !== "wait" && this.redis.status !== "end") {
      await this.redis.quit().catch((error) => {
        console.error("Error closing Redis connection.", error);
      });
    }
  }
}

export const sessionStore = new SessionStore();
