/**
 * Raine Backend - User Deletion Trigger
 * Cleans up user data when a user is deleted (GDPR compliance)
 */

import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
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

    // 2. Delete user devices
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

    // 3. Delete user room memberships (inverse lookup)
    const membershipsSnapshot = await db
      .collection(`users/${userId}/roomMemberships`)
      .get();
    if (!membershipsSnapshot.empty) {
      await batchDelete(membershipsSnapshot.docs);
      logger.info("Deleted user room memberships", {
        userId,
        count: membershipsSnapshot.size,
      });
    }

    // 4. Remove user from all rooms they were a member of
    // const roomMembersQuery = await db
    //   .collectionGroup("members")
    //   .where("__name__", ">=", `rooms/${userId}`)
    //   .where("__name__", "<", `rooms/${userId}\uf8ff`)
    //   .get();

    // This query won't work as expected, so we need to iterate rooms
    // Get all rooms and check if user is a member
    const roomsSnapshot = await db.collection("rooms").get();
    for (const roomDoc of roomsSnapshot.docs) {
      const memberRef = db.doc(`rooms/${roomDoc.id}/members/${userId}`);
      const memberDoc = await memberRef.get();
      if (memberDoc.exists) {
        await memberRef.delete();
        // Decrement member count
        await roomDoc.ref.update({
          memberCount: (roomDoc.data().memberCount || 1) - 1,
        });
        logger.info("Removed user from room", {userId, roomId: roomDoc.id});
      }
    }

    // 5. Delete user notifications
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

    // 6. Delete user reports (both as reporter and reported)
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

    // 7. Clean up rate limit records
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
