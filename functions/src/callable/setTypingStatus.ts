/**
 * Raine Backend - Set Typing Status
 * Callable function to update typing indicators in rooms
 */

import {onCall, HttpsError, CallableOptions} from "firebase-functions/v2/https";

const REGION = "us-west2";
const callableOptions: CallableOptions = {region: REGION};
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {withRateLimit} from "../services/rateLimit";

interface TypingStatusRequest {
  roomId: string;
  isTyping: boolean;
}

interface TypingStatusResponse {
  success: boolean;
}

/**
 * Update typing status for a user in a room
 */
export const setTypingStatus = onCall<TypingStatusRequest>(
  callableOptions,
  async (request): Promise<TypingStatusResponse> => {
  // Check authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.auth.uid;
    const {roomId, isTyping} = request.data;

    // Validate input
    if (!roomId || typeof roomId !== "string") {
      throw new HttpsError("invalid-argument", "Room ID is required");
    }

    if (typeof isTyping !== "boolean") {
      throw new HttpsError("invalid-argument", "isTyping must be a boolean");
    }

    return withRateLimit(userId, "typing_status", async () => {
      try {
      // Verify user is a member of the room
        const memberRef = db.doc(`rooms/${roomId}/members/${userId}`);
        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
          throw new HttpsError("permission-denied", "Not a member of this room");
        }

        // Update typing status
        const typingRef = db.doc(`rooms/${roomId}/typing/${userId}`);

        if (isTyping) {
          await typingRef.set({
            isTyping: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
        // Delete the typing indicator when not typing
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
