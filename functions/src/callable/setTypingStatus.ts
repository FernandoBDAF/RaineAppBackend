import * as functions from "firebase-functions/v1";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {withRateLimit} from "../services/rateLimit";
import {Connection} from "../types";

const REGION = "us-west2";

interface TypingStatusRequest {
  connectionId: string;
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
    const {connectionId, isTyping} = data as TypingStatusRequest;

    if (!connectionId || typeof connectionId !== "string") {
      throw new HttpsError("invalid-argument", "Connection ID is required");
    }

    if (typeof isTyping !== "boolean") {
      throw new HttpsError("invalid-argument", "isTyping must be a boolean");
    }

    return withRateLimit(userId, "typing_status", async () => {
      try {
        const connectionRef = db.doc(`connections/${connectionId}`);
        const connectionDoc = await connectionRef.get();

        if (!connectionDoc.exists) {
          throw new HttpsError("not-found", "Connection not found");
        }

        const connection = connectionDoc.data() as Connection;

        if (!connection.memberUids.includes(userId)) {
          throw new HttpsError("permission-denied", "Not a member of this connection");
        }

        const typingRef = db.doc(`connections/${connectionId}/typing/${userId}`);

        if (isTyping) {
          await typingRef.set({
            isTyping: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await typingRef.delete();
        }

        logger.info("Typing status updated", {userId, connectionId, isTyping});

        return {success: true};
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        logger.error("Error setting typing status", {
          userId,
          connectionId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw new HttpsError("internal", "Failed to update typing status");
      }
    });
  });
