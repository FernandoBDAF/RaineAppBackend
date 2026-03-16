import * as functions from "firebase-functions/v1";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../utils/helpers";
import {Connection} from "../types";

const REGION = "us-west2";

interface MarkReadRequest {
  connectionId: string;
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
    const {connectionId, messageId} = data as MarkReadRequest;

    if (!connectionId || typeof connectionId !== "string") {
      throw new HttpsError("invalid-argument", "Connection ID is required");
    }

    logger.info("Marking messages as read", {userId, connectionId, messageId});

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

      const now = new Date();
      const timestamp = FieldValue.serverTimestamp();

      if (messageId) {
        const readReceiptRef = db.doc(
          `connections/${connectionId}/messages/${messageId}/readBy/${userId}`
        );
        await readReceiptRef.set({timestamp});
      }

      logger.info("Messages marked as read", {userId, connectionId, messageId});

      return {success: true, timestamp: now.toISOString()};
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error marking messages read", {
        userId,
        connectionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HttpsError("internal", "Failed to mark messages as read");
    }
  });
