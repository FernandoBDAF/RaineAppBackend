/**
 * Raine Backend - User Deletion Trigger
 * Cleans up user data when a user is deleted (GDPR compliance)
 *
 * Aligned with connections-based data model (rooms removed).
 */

import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, batchDelete} from "../../utils/helpers";

const REGION = "us-west2";

/**
 * Triggered when a user is deleted from Firebase Auth
 * Cleans up all user-related data from Firestore
 */
export const onUserDelete = functions.region(REGION).auth.user().onDelete(async (user) => {
  const userId = user.uid;

  logger.info("User deletion started", {
    userId,
    email: user.email,
  });

  try {
    // 1. Delete user profile document
    await db.doc(`users/${userId}`).delete();
    logger.info("Deleted user profile", {userId});

    // 2. Cancel all connections where user is a member
    const connectionsSnapshot = await db
      .collection("connections")
      .where("memberUids", "array-contains", userId)
      .get();

    for (const connectionDoc of connectionsSnapshot.docs) {
      const connection = connectionDoc.data();

      const updates: Record<string, unknown> = {
        status: "canceled",
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (connection.fromUser?.uid === userId) {
        updates["fromUser"] = null;
      }
      if (connection.toUser?.uid === userId) {
        updates["toUser"] = null;
      }

      await connectionDoc.ref.update(updates);
      logger.info("Canceled connection", {userId, connectionId: connectionDoc.id});
    }

    // 3. Delete user devices
    const devicesSnapshot = await db
      .collection(`users/${userId}/devices`)
      .get();
    if (!devicesSnapshot.empty) {
      await batchDelete(devicesSnapshot.docs);
      logger.info("Deleted user devices", {
        userId,
        count: devicesSnapshot.size,
      });
    }

    // 4. Delete user notifications
    const notificationsSnapshot = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .get();
    if (!notificationsSnapshot.empty) {
      await batchDelete(notificationsSnapshot.docs);
      logger.info("Deleted user notifications", {
        userId,
        count: notificationsSnapshot.size,
      });
    }

    // 5. Delete user reports (both as reporter and reported)
    const reportsAsReporterSnapshot = await db
      .collection("userReports")
      .where("reporterId", "==", userId)
      .get();
    if (!reportsAsReporterSnapshot.empty) {
      await batchDelete(reportsAsReporterSnapshot.docs);
    }

    const reportsAsReportedSnapshot = await db
      .collection("userReports")
      .where("reportedUserId", "==", userId)
      .get();
    if (!reportsAsReportedSnapshot.empty) {
      await batchDelete(reportsAsReportedSnapshot.docs);
    }

    // 6. Clean up rate limit records
    const rateLimitsSnapshot = await db
      .collection("rateLimits")
      .where("__name__", ">=", `${userId}_`)
      .where("__name__", "<", `${userId}_\uf8ff`)
      .get();
    if (!rateLimitsSnapshot.empty) {
      await batchDelete(rateLimitsSnapshot.docs);
    }

    logger.info("User deletion completed", {userId});
  } catch (error) {
    logger.error("Error during user deletion cleanup", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
});
