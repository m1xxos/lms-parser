import axios from "axios";
import { z } from "zod";
import { detectMoodlePublic } from "./html-fallback.js";
import { MoodleWsClient } from "./ws-client.js";

const tokenResponseSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
  errorcode: z.string().optional()
});

function normalizeBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return parsed.toString().replace(/\/$/, "");
}

export async function connectToMoodle(input: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<{
  baseUrl: string;
  token: string;
  userId: number;
  userFullName: string;
  siteName: string;
  version: string;
}> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);

  const tokenUrl = `${baseUrl}/login/token.php`;
  const payload = new URLSearchParams({
    username: input.username,
    password: input.password,
    service: "moodle_mobile_app"
  });

  let token: string | undefined;

  try {
    const tokenResponse = await axios.post(tokenUrl, payload.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000
    });

    const parsed = tokenResponseSchema.parse(tokenResponse.data);
    token = parsed.token;

    if (!token) {
      const detail = parsed.error ?? parsed.errorcode ?? "unknown_error";
      throw new Error(`Moodle auth failed: ${detail}`);
    }
  } catch (error) {
    const isMoodle = await detectMoodlePublic(baseUrl);
    if (!isMoodle) {
      throw new Error("URL does not look like Moodle LMS or is unavailable.");
    }
    throw error;
  }

  const client = new MoodleWsClient(baseUrl, token);
  const siteInfo = await client.getSiteInfo();

  return {
    baseUrl,
    token,
    userId: siteInfo.userid,
    userFullName: siteInfo.fullname,
    siteName: siteInfo.sitename,
    version: siteInfo.release ?? siteInfo.version ?? "unknown"
  };
}
