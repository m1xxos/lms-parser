import { v4 as uuid } from "uuid";
import { MoodleSession } from "../types.js";
import { encryptString } from "../utils/crypto.js";

class SessionStore {
  private readonly sessions = new Map<string, MoodleSession>();

  create(payload: {
    baseUrl: string;
    userId: number;
    userFullName: string;
    siteName: string;
    version: string;
    token: string;
  }): MoodleSession {
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

    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string): MoodleSession | null {
    return this.sessions.get(sessionId) ?? null;
  }
}

export const sessionStore = new SessionStore();
