/**
 * Raine Backend - Mark Messages Read
 * Callable function to mark messages as read and update read receipts
 */

import {onCall, HttpsError, CallableOptions} from "firebase-functions/v2/https";

const REGION = "us-west2";
const callableOptions: CallableOptions = {region: REGION};
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";

interface MarkReadRequest {
  roomId: string;
  messageId?: string; // Optional - if not provided, marks all as read
}

interface MarkReadResponse {
  success: boolean;
  timestamp: string;
}

/**
 * Mark messages as read and update read receipts
 */
export const markMessagesRead = onCall<MarkReadRequest>(callableOptions, async (request): Promise<MarkReadResponse> => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const userId = request.auth.uid;
  const {roomId, messageId} = request.data;

  // Validate input
  if (!roomId || typeof roomId !== "string") {
    throw new HttpsError("invalid-argument", "Room ID is required");
  }

  logger.info("Marking messages as read", {userId, roomId, messageId});

  try {
    // Verify user is a member of the room
    const memberRef = db.doc(`rooms/${roomId}/members/${userId}`);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      throw new HttpsError("permission-denied", "Not a member of this room");
    }

    const now = new Date();
    const timestamp = FieldValue.serverTimestamp();

    if (messageId) {
      // Mark specific message as read
      const readReceiptRef = db.doc(
        `rooms/${roomId}/messages/${messageId}/readBy/${userId}`
      );
      await readReceiptRef.set({
        timestamp,
      });
    }

    // Always update user's lastRead in their room membership
    await db.doc(`users/${userId}/roomMemberships/${roomId}`).set({
      lastRead: timestamp,
    }, {merge: true});

    // Also update in room members
    await memberRef.update({
      lastRead: timestamp,
    });

    logger.info("Messages marked as read", {userId, roomId});

    return {
      success: true,
      timestamp: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error marking messages read", {
      userId,
      roomId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new HttpsError("internal", "Failed to mark messages as read");
  }
});
