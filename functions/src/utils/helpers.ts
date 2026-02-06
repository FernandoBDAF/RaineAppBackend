/**
 * Raine Backend - Utility Helper Functions
 */

import * as admin from "firebase-admin";

export const db = admin.firestore();
export const auth = admin.auth();
export const messaging = admin.messaging();

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
  quietHoursStart?: string;
  quietHoursEnd?: string;
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
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
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
