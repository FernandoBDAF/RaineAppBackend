import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";
import {db, batchDelete} from "../utils/helpers";

const DEVICE_EXPIRY_DAYS = 30;
const PROCESSED_EVENTS_EXPIRY_DAYS = 7;
const TYPING_EXPIRY_SECONDS = 10;

export const cleanupDevices = functions
  .region("us-west2")
  .pubsub.schedule("0 3 * * *")
  .onRun(async () => {
    logger.info("Starting cleanup job");

    let devicesDeleted = 0;
    let processedEventsDeleted = 0;
    let typingIndicatorsDeleted = 0;

    try {
      const deviceCutoff = Timestamp.fromMillis(
        Date.now() - DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      );
      const processedEventsCutoff = Timestamp.fromMillis(
        Date.now() - PROCESSED_EVENTS_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      );
      const typingCutoff = Timestamp.fromMillis(
        Date.now() - TYPING_EXPIRY_SECONDS * 1000
      );

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

      const processedEventsSnapshot = await db
        .collection("processedEvents")
        .where("processedAt", "<", processedEventsCutoff)
        .limit(500)
        .get();

      if (!processedEventsSnapshot.empty) {
        await batchDelete(processedEventsSnapshot.docs);
        processedEventsDeleted = processedEventsSnapshot.size;
      }

      logger.info(`Deleted ${processedEventsDeleted} old processed events`);

      // Clean stale typing indicators from connections
      const connectionsSnapshot = await db.collection("connections").get();

      for (const connectionDoc of connectionsSnapshot.docs) {
        const typingSnapshot = await db
          .collection(`connections/${connectionDoc.id}/typing`)
          .where("updatedAt", "<", typingCutoff)
          .get();

        if (!typingSnapshot.empty) {
          await batchDelete(typingSnapshot.docs);
          typingIndicatorsDeleted += typingSnapshot.size;
        }
      }

      logger.info(`Deleted ${typingIndicatorsDeleted} stale typing indicators`);

      const rateLimitCutoff = Timestamp.fromMillis(
        Date.now() - 24 * 60 * 60 * 1000
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
