/**
 * Raine Backend - Process Notification Retry Queue
 * Scheduled function to retry failed notifications
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, batchDelete} from "../utils/helpers";
import {sendPushNotifications} from "../services/notifications";
import {NotificationRetry} from "../types";

const MAX_RETRIES = 3;

/**
 * Process failed notifications in the retry queue
 * Runs every 5 minutes
 */
export const processRetryQueue = onSchedule({schedule: "every 5 minutes", region: "us-west2"}, async () => {
  logger.info("Processing notification retry queue");

  try {
    // Get items from retry queue (limit to 100 per run)
    const retrySnapshot = await db
      .collection("notificationRetryQueue")
      .orderBy("createdAt", "asc")
      .limit(100)
      .get();

    if (retrySnapshot.empty) {
      logger.info("No items in retry queue");
      return;
    }

    logger.info(`Processing ${retrySnapshot.size} retry items`);

    const successfulRetries: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const failedRetries: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const deadLetters: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const doc of retrySnapshot.docs) {
      const retry = doc.data() as NotificationRetry;

      if (retry.retryCount >= MAX_RETRIES) {
        // Move to dead letter queue
        deadLetters.push(doc);
        await db.collection("deadLetterQueue").add({
          ...retry,
          movedAt: FieldValue.serverTimestamp(),
          reason: `Exceeded max retries (${MAX_RETRIES})`,
        });
        continue;
      }

      try {
        // Attempt to send notifications
        await sendPushNotifications(retry.roomId, retry.message);

        successfulRetries.push(doc);
        logger.info("Retry successful", {
          roomId: retry.roomId,
          messageId: retry.messageId,
        });
      } catch (error) {
        // Update retry count
        await doc.ref.update({
          retryCount: retry.retryCount + 1,
          lastError: error instanceof Error ? error.message : "Unknown error",
          lastRetryAt: FieldValue.serverTimestamp(),
        });
        failedRetries.push(doc);
        logger.warn("Retry failed", {
          roomId: retry.roomId,
          messageId: retry.messageId,
          retryCount: retry.retryCount + 1,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Delete successful retries
    if (successfulRetries.length > 0) {
      await batchDelete(successfulRetries);
    }

    // Delete dead letters (already moved to deadLetterQueue)
    if (deadLetters.length > 0) {
      await batchDelete(deadLetters);
    }

    logger.info("Retry queue processing completed", {
      total: retrySnapshot.size,
      successful: successfulRetries.length,
      failed: failedRetries.length,
      deadLettered: deadLetters.length,
    });
  } catch (error) {
    logger.error("Error processing retry queue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
});
