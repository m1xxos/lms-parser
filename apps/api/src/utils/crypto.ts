import crypto from "crypto";
import { config } from "../config.js";

const KEY = crypto.createHash("sha256").update(config.appSecret).digest();

export function encryptString(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptString(value: string): string {
  const [ivB64, tagB64, encryptedB64] = value.split(":");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted payload format.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
