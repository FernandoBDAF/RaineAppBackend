/**
 * Raine Backend - Push Notification Service
 * Handles sending push notifications to users across multiple devices
 */

import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, messaging, truncateMessage, isInQuietHours} from "../utils/helpers";
import {DeviceToken, User, NotificationPreferences} from "../types";

/**
 * Send push notifications to all members of a room (except sender)
 */
export async function sendPushNotifications(
  roomId: string,
  message: {text: string; senderId: string; timestamp: unknown}
): Promise<void> {
  // Get room details
  const roomDoc = await db.doc(`rooms/${roomId}`).get();
  const room = roomDoc.data();

  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  // Get room members (excluding sender)
  const membersSnapshot = await db.collection(`rooms/${roomId}/members`).get();

  const recipientIds = membersSnapshot.docs
    .map((doc) => doc.id)
    .filter((id) => id !== message.senderId);

  if (recipientIds.length === 0) {
    logger.info("No recipients to notify", {roomId});
    return;
  }

  // Get all device tokens for all recipients
  const deviceTokens: DeviceToken[] = [];

  for (const userId of recipientIds) {
    // Check user notification preferences
    const userDoc = await db.doc(`users/${userId}`).get();
    const user = userDoc.data() as User | undefined;

    if (!user?.notificationPreferences?.enabled) {
      continue;
    }

    // Check quiet hours
    if (isInQuietHours(user.notificationPreferences as NotificationPreferences)) {
      continue;
    }

    // Get all devices for this user
    const devicesSnapshot = await db
      .collection(`users/${userId}/devices`)
      .get();

    devicesSnapshot.docs.forEach((deviceDoc) => {
      const device = deviceDoc.data();
      if (device.fcmToken) {
        deviceTokens.push({
          token: device.fcmToken,
          userId: userId,
          deviceId: deviceDoc.id,
          platform: device.platform || "unknown",
        });
      }
    });
  }

  if (deviceTokens.length === 0) {
    logger.info("No valid tokens to send to", {roomId});
    return;
  }

  // Send multicast message
  const payload = {
    notification: {
      title: room.name || "New Message",
      body: truncateMessage(message.text, 100),
    },
    data: {
      roomId: roomId,
      senderId: message.senderId,
      type: "new_message",
    },
    tokens: deviceTokens.map((d) => d.token),
    apns: {
      payload: {
        aps: {
          badge: 1,
          sound: "default",
        },
      },
    },
    android: {
      priority: "high" as const,
      notification: {
        sound: "default",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
  };

  const response = await messaging.sendEachForMulticast(payload);

  logger.info("Push notifications sent", {
    roomId,
    totalTokens: deviceTokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
  });

  // Handle failed tokens (remove invalid ones)
  await handleFailedTokens(response, deviceTokens);
}

/**
 * Handle failed FCM tokens by removing invalid ones from the database
 */
async function handleFailedTokens(
  response: {responses: Array<{success: boolean; error?: {code: string}}>},
  deviceTokens: DeviceToken[]
): Promise<void> {
  const tokensToRemove: DeviceToken[] = [];

  response.responses.forEach((result, index) => {
    if (!result.success) {
      const error = result.error;
      // Remove tokens that are invalid or unregistered
      if (
        error?.code === "messaging/invalid-registration-token" ||
        error?.code === "messaging/registration-token-not-registered"
      ) {
        tokensToRemove.push(deviceTokens[index]);
      }
    }
  });

  // Batch delete invalid tokens
  if (tokensToRemove.length > 0) {
    const batch = db.batch();
    tokensToRemove.forEach((device) => {
      const deviceRef = db.doc(`users/${device.userId}/devices/${device.deviceId}`);
      batch.delete(deviceRef);
    });
    await batch.commit();

    logger.info("Removed invalid tokens", {
      count: tokensToRemove.length,
    });
  }
}

/**
 * Send a notification to a specific user
 */
export async function sendUserNotification(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  // Create in-app notification
  await db.collection("notifications").add({
    userId,
    type: "system",
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Send push notification
  const devicesSnapshot = await db.collection(`users/${userId}/devices`).get();
  const tokens = devicesSnapshot.docs
    .map((doc) => doc.data().fcmToken)
    .filter(Boolean) as string[];

  if (tokens.length > 0) {
    await messaging.sendEachForMulticast({
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      tokens,
    });
  }
}

/**
 * Notify user about billing issue
 */
export async function notifyUserBillingIssue(userId: string): Promise<void> {
  await sendUserNotification(userId, {
    title: "Payment Issue",
    body: "There was a problem processing your payment. Please update your payment method.",
    data: {type: "billing_issue", action: "update_payment"},
  });
}

/**
 * Notify user about subscription expiration
 */
export async function notifyUserSubscriptionExpired(
  userId: string
): Promise<void> {
  await sendUserNotification(userId, {
    title: "Subscription Expired",
    body: "Your subscription has expired. Renew to continue enjoying premium features.",
    data: {type: "subscription_expired", action: "renew_subscription"},
  });
}
