/**
 * Raine Backend - Utility Helper Functions
 */

import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {getMessaging} from "firebase-admin/messaging";

if (!getApps().length) {
  initializeApp();
}
export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

/**
 * Truncate a message to a maximum length
 */
export function truncateMessage(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Check if current time is within quiet hours
 */
export function isInQuietHours(prefs: {
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = prefs.quietHoursStart.split(":").map(Number);
  const [endHour, endMin] = prefs.quietHoursEnd.split(":").map(Number);

  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime <= endTime) {
    // Same day: e.g., 22:00 to 23:00
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Spans midnight: e.g., 22:00 to 07:00
    return currentTime >= startTime || currentTime < endTime;
  }
}

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  return db.collection("_temp").doc().id;
}

/**
 * Batch delete documents (handles Firestore 500 limit)
 */
export async function batchDelete(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
  const batchSize = 500;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);

    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Safe JSON stringify for logging
 */
export function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "[Unable to stringify]";
  }
}

/**
 * Timing-safe string comparison (for webhook signature verification)
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const crypto = require("crypto");
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Generate a referral code (7 alphanumeric characters)
 */
const REFERRAL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += REFERRAL_CHARS.charAt(
      Math.floor(Math.random() * REFERRAL_CHARS.length),
    );
  }
  return code;
}

/**
 * Check if a referral code is already in use by any user
 */
export async function isReferralCodeTaken(code: string): Promise<boolean> {
  const snapshot = await db
    .collection("users")
    .where("referralCode", "==", code)
    .limit(1)
    .get();
  return !snapshot.empty;
}

/**
 * Generate a unique referral code (retries on collision)
 */
export async function generateUniqueReferralCode(): Promise<string> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCode();
    if (!(await isReferralCodeTaken(code))) {
      return code;
    }
  }
  throw new Error("Unable to generate unique referral code");
}
