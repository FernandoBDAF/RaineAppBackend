/**
 * Raine Backend - Rate Limiting Service
 * Protects against abuse by limiting request frequency per user
 */

import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {RateLimitConfig, RateLimitResult} from "../types";

/**
 * Rate limit configurations for different actions
 */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  message_send: {windowMs: 60 * 1000, maxRequests: 30}, // 30 per minute
  room_create: {windowMs: 60 * 60 * 1000, maxRequests: 10}, // 10 per hour
  report_user: {windowMs: 24 * 60 * 60 * 1000, maxRequests: 5}, // 5 per day
  typing_status: {windowMs: 10 * 1000, maxRequests: 10}, // 10 per 10 seconds
};

/**
 * Check if an action is allowed based on rate limits
 */
export async function checkRateLimit(
  userId: string,
  action: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action];
  if (!config) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const rateLimitRef = db.doc(`rateLimits/${userId}_${action}`);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const data = doc.data();

    // Clean up old timestamps and count current window
    const timestamps: number[] = data?.timestamps || [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= config.maxRequests) {
      // Rate limited
      const oldestInWindow = Math.min(...validTimestamps);
      const resetAt = new Date(oldestInWindow + config.windowMs);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add new timestamp
    validTimestamps.push(now);
    transaction.set(rateLimitRef, {
      timestamps: validTimestamps,
      lastUpdated: FieldValue.serverTimestamp(),
    });

    return {
      allowed: true,
      remaining: config.maxRequests - validTimestamps.length,
      resetAt: new Date(now + config.windowMs),
    };
  });
}

/**
 * Middleware wrapper for callable functions with rate limiting
 */
export async function withRateLimit<T>(
  userId: string,
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  const {allowed, resetAt} = await checkRateLimit(userId, action);

  if (!allowed) {
    throw new HttpsError(
      "resource-exhausted",
      `Rate limit exceeded. Try again after ${resetAt.toISOString()}`
    );
  }

  return fn();
}
