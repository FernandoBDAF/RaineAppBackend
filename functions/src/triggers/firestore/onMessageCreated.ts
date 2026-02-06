/**
 * Raine Backend - Message Creation Trigger
 * Handles push notifications and room updates when a message is created
 */

import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../../utils/helpers";
import {sendPushNotifications} from "../../services/notifications";
import {Message} from "../../types";

const REGION = "us-west2";

/**
 * Triggered when a new message is created in a room
 * - Updates room lastMessage
 * - Sends push notifications to room members
 * - Implements idempotency to prevent duplicate processing
 */
export const onMessageCreated = functions.region(REGION).firestore
  .document("rooms/{roomId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const {roomId, messageId} = context.params;
    const eventId = context.eventId; // Unique event ID for idempotency

    logger.info("New message created", {roomId, messageId, eventId});

    // Idempotency check - prevent duplicate processing
    const processedRef = db.doc(`processedEvents/${eventId}`);
    const processedDoc = await processedRef.get();

    if (processedDoc.exists) {
      logger.info("Event already processed, skipping", {eventId});
      return;
    }

    const message = snapshot.data() as Message;

    try {
      // Use transaction for atomic operations
      await db.runTransaction(async (transaction) => {
        // 1. Mark event as processed (idempotency)
        transaction.set(processedRef, {
          processedAt: FieldValue.serverTimestamp(),
          functionName: "onMessageCreated",
        });

        // 2. Update room lastMessage
        const roomRef = db.doc(`rooms/${roomId}`);
        transaction.update(roomRef, {
          lastMessage: {
            text: message.text,
            senderId: message.senderId,
            timestamp: message.timestamp,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });

        // 3. Update sender's lastSeen
        const userRef = db.doc(`users/${message.senderId}`);
        transaction.update(userRef, {
          lastSeen: FieldValue.serverTimestamp(),
        });
      });

      // 4. Send push notifications (outside transaction for performance)
      try {
        await sendPushNotifications(roomId, {
          text: message.text,
          senderId: message.senderId,
          timestamp: message.timestamp,
        });
      } catch (notificationError) {
        // Don't fail the function if notifications fail
        // Instead, queue for retry
        logger.error("Failed to send notifications", {
          roomId,
          messageId,
          error: notificationError instanceof Error ?
            notificationError.message : "Unknown error",
        });

        // Add to retry queue
        await db.collection("notificationRetryQueue").add({
          roomId,
          messageId,
          message: {
            text: message.text,
            senderId: message.senderId,
            timestamp: message.timestamp,
          },
          error: notificationError instanceof Error ?
            notificationError.message : "Unknown error",
          createdAt: FieldValue.serverTimestamp(),
          retryCount: 0,
        });
      }

      logger.info("Message processing completed", {roomId, messageId});
    } catch (error) {
      logger.error("Error processing message", {
        roomId,
        messageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  });
