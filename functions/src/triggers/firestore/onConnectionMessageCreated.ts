/**
 * Raine Backend - Connection Message Creation Trigger
 *
 * Handles push notifications and connection lastMessage updates when a message
 * is created in connections/{connectionId}/messages. This is the new data model
 * where the connection IS the chat room (no separate rooms collection).
 *
 * See: RaineApp/development/3-connections-refactor-plan.md
 */

import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../../utils/helpers";
import {sendPushNotificationsForConnection} from "../../services/notifications";
import {Message} from "../../types";

const REGION = "us-west2";

/**
 * Triggered when a new message is created in a connection's messages subcollection.
 * - Updates connection lastMessage (source of truth for receiver)
 * - Sends push notifications to connection members
 * - Implements idempotency to prevent duplicate processing
 */
export const onConnectionMessageCreated = functions.region(REGION).firestore
  .document("connections/{connectionId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const {connectionId, messageId} = context.params;
    const eventId = context.eventId;

    logger.info("New connection message created", {connectionId, messageId, eventId});

    const processedRef = db.doc(`processedEvents/${eventId}`);
    const processedDoc = await processedRef.get();

    if (processedDoc.exists) {
      logger.info("Event already processed, skipping", {eventId});
      return;
    }

    const message = snapshot.data() as Message;

    try {
      await db.runTransaction(async (transaction) => {
        transaction.set(processedRef, {
          processedAt: FieldValue.serverTimestamp(),
          functionName: "onConnectionMessageCreated",
        });

        const connectionRef = db.doc(`connections/${connectionId}`);
        transaction.update(connectionRef, {
          lastMessage: {
            text: message.text,
            senderId: message.senderId,
            timestamp: message.timestamp,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });

        const userRef = db.doc(`users/${message.senderId}`);
        transaction.update(userRef, {
          lastSeen: FieldValue.serverTimestamp(),
        });
      });

      try {
        await sendPushNotificationsForConnection(connectionId, {
          text: message.text,
          senderId: message.senderId,
          timestamp: message.timestamp,
        });
      } catch (notificationError) {
        logger.error("Failed to send connection notifications", {
          connectionId,
          messageId,
          error: notificationError instanceof Error ?
            notificationError.message : "Unknown error",
        });

        await db.collection("notificationRetryQueue").add({
          connectionId,
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

      logger.info("Connection message processing completed", {connectionId, messageId});
    } catch (error) {
      logger.error("Error processing connection message", {
        connectionId,
        messageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  });
