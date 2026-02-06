/**
 * Raine Backend - Cleanup Inactive Devices
 * Scheduled function to remove old device tokens and processed events
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";
import {db, batchDelete} from "../utils/helpers";

// Device tokens older than 30 days are considered stale
const DEVICE_EXPIRY_DAYS = 30;
// Processed events older than 7 days can be cleaned up
const PROCESSED_EVENTS_EXPIRY_DAYS = 7;
// Typing indicators older than 10 seconds should be cleaned up
const TYPING_EXPIRY_SECONDS = 10;

/**
 * Clean up stale data:
 * - Inactive device tokens (not used in 30 days)
 * - Old processed events (idempotency records)
 * - Stale typing indicators
 *
 * Runs daily at 3:00 AM
 */
export const cleanupDevices = onSchedule({schedule: "0 3 * * *", region: "us-west2"}, async () => {
  logger.info("Starting cleanup job");

  let devicesDeleted = 0;
  let processedEventsDeleted = 0;
  let typingIndicatorsDeleted = 0;

  try {
    // Calculate cutoff dates
    const deviceCutoff = Timestamp.fromMillis(
      Date.now() - DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
    const processedEventsCutoff = Timestamp.fromMillis(
      Date.now() - PROCESSED_EVENTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
    const typingCutoff = Timestamp.fromMillis(
      Date.now() - TYPING_EXPIRY_SECONDS * 1000
    );

    // 1. Clean up inactive devices
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const devicesSnapshot = await db
        .collection(`users/${userDoc.id}/devices`)
        .where("lastActive", "<", deviceCutoff)
        .get();

      if (!devicesSnapshot.empty) {
        await batchDelete(devicesSnapshot.docs);
        devicesDeleted += devicesSnapshot.size;
      }
    }

    logger.info(`Deleted ${devicesDeleted} stale device tokens`);

    // 2. Clean up old processed events (idempotency records)
    const processedEventsSnapshot = await db
      .collection("processedEvents")
      .where("processedAt", "<", processedEventsCutoff)
      .limit(500) // Process in batches
      .get();

    if (!processedEventsSnapshot.empty) {
      await batchDelete(processedEventsSnapshot.docs);
      processedEventsDeleted = processedEventsSnapshot.size;
    }

    logger.info(`Deleted ${processedEventsDeleted} old processed events`);

    // 3. Clean up stale typing indicators across all rooms
    const roomsSnapshot = await db.collection("rooms").get();

    for (const roomDoc of roomsSnapshot.docs) {
      const typingSnapshot = await db
        .collection(`rooms/${roomDoc.id}/typing`)
        .where("updatedAt", "<", typingCutoff)
        .get();

      if (!typingSnapshot.empty) {
        await batchDelete(typingSnapshot.docs);
        typingIndicatorsDeleted += typingSnapshot.size;
      }
    }

    logger.info(`Deleted ${typingIndicatorsDeleted} stale typing indicators`);

    // 4. Clean up old rate limit records (optional)
    // Rate limit records naturally expire based on their window, but we can
    // clean up very old ones to prevent database bloat
    const rateLimitCutoff = Timestamp.fromMillis(
      Date.now() - 24 * 60 * 60 * 1000 // 24 hours
    );

    const rateLimitsSnapshot = await db
      .collection("rateLimits")
      .where("lastUpdated", "<", rateLimitCutoff)
      .limit(500)
      .get();

    if (!rateLimitsSnapshot.empty) {
      await batchDelete(rateLimitsSnapshot.docs);
      logger.info(`Deleted ${rateLimitsSnapshot.size} old rate limit records`);
    }

    logger.info("Cleanup job completed", {
      devicesDeleted,
      processedEventsDeleted,
      typingIndicatorsDeleted,
    });
  } catch (error) {
    logger.error("Error during cleanup", {
      error: error instanceof Error ? error.message : "Unknown error",
      devicesDeleted,
      processedEventsDeleted,
      typingIndicatorsDeleted,
    });
    throw error;
  }
});
