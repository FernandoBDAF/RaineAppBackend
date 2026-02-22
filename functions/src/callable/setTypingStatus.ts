import * as functions from "firebase-functions/v1";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {withRateLimit} from "../services/rateLimit";

const REGION = "us-west2";

interface TypingStatusRequest {
  roomId: string;
  isTyping: boolean;
}

interface TypingStatusResponse {
  success: boolean;
}

export const setTypingStatus = functions
  .region(REGION)
  .https.onCall(async (data, context): Promise<TypingStatusResponse> => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = context.auth.uid;
    const {roomId, isTyping} = data as TypingStatusRequest;

    if (!roomId || typeof roomId !== "string") {
      throw new HttpsError("invalid-argument", "Room ID is required");
    }

    if (typeof isTyping !== "boolean") {
      throw new HttpsError("invalid-argument", "isTyping must be a boolean");
    }

    return withRateLimit(userId, "typing_status", async () => {
      try {
        const memberRef = db.doc(`rooms/${roomId}/members/${userId}`);
        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
          throw new HttpsError("permission-denied", "Not a member of this room");
        }

        const typingRef = db.doc(`rooms/${roomId}/typing/${userId}`);

        if (isTyping) {
          await typingRef.set({
            isTyping: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await typingRef.delete();
        }

        logger.info("Typing status updated", {userId, roomId, isTyping});

        return {success: true};
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        logger.error("Error setting typing status", {
          userId,
          roomId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw new HttpsError("internal", "Failed to update typing status");
      }
    });
  });
