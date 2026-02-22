import * as functions from "firebase-functions/v1";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";

const REGION = "us-west2";

interface MarkReadRequest {
  roomId: string;
  messageId?: string;
}

interface MarkReadResponse {
  success: boolean;
  timestamp: string;
}

export const markMessagesRead = functions
  .region(REGION)
  .https.onCall(async (data, context): Promise<MarkReadResponse> => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = context.auth.uid;
    const {roomId, messageId} = data as MarkReadRequest;

    if (!roomId || typeof roomId !== "string") {
      throw new HttpsError("invalid-argument", "Room ID is required");
    }

    logger.info("Marking messages as read", {userId, roomId, messageId});

    try {
      const memberRef = db.doc(`rooms/${roomId}/members/${userId}`);
      const memberDoc = await memberRef.get();

      if (!memberDoc.exists) {
        throw new HttpsError("permission-denied", "Not a member of this room");
      }

      const now = new Date();
      const timestamp = FieldValue.serverTimestamp();

      if (messageId) {
        const readReceiptRef = db.doc(
          `rooms/${roomId}/messages/${messageId}/readBy/${userId}`
        );
        await readReceiptRef.set({timestamp});
      }

      await db.doc(`users/${userId}/roomMemberships/${roomId}`).set(
        {lastRead: timestamp},
        {merge: true}
      );

      await memberRef.update({lastRead: timestamp});

      logger.info("Messages marked as read", {userId, roomId});

      return {success: true, timestamp: now.toISOString()};
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
