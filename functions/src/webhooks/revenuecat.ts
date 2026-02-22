import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, timingSafeEqual} from "../utils/helpers";
import {
  notifyUserBillingIssue,
  notifyUserSubscriptionExpired,
} from "../services/notifications";
import {
  RevenueCatWebhookPayload,
  RevenueCatEventType,
  SubscriptionStatus,
} from "../types";

const revenuecatWebhookSecret = defineSecret("REVENUECAT_WEBHOOK_SECRET");

function verifySignature(
  authHeader: string | undefined,
  secret: string
): boolean {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return timingSafeEqual(match[1], secret);
}

export const revenuecatWebhook = functions
  .region("us-west2")
  .runWith({secrets: ["REVENUECAT_WEBHOOK_SECRET"]})
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const webhookSecret = revenuecatWebhookSecret.value();
    if (!webhookSecret) {
      logger.error("Webhook secret not configured");
      res.status(500).send("Server configuration error");
      return;
    }

    if (!verifySignature(req.headers.authorization, webhookSecret)) {
      logger.warn("Invalid webhook signature", {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      res.status(401).send("Unauthorized");
      return;
    }

    const payload = req.body as RevenueCatWebhookPayload;
    if (!payload?.event) {
      logger.warn("Invalid webhook payload");
      res.status(400).send("Invalid payload");
      return;
    }

    const {event} = payload;
    const eventId = event.id;
    const eventType = event.type;
    const userId = event.app_user_id;

    logger.info("RevenueCat webhook received", {eventId, eventType, userId});

    const processedRef = db.doc(`processedWebhooks/${eventId}`);
    const processedDoc = await processedRef.get();

    if (processedDoc.exists) {
      logger.info("Webhook already processed", {eventId});
      res.status(200).send("Already processed");
      return;
    }

    try {
      await processRevenueCatEvent(eventType, userId, event);
      await processedRef.set({
        processedAt: FieldValue.serverTimestamp(),
        eventType,
        userId,
      });
      logger.info("Webhook processed successfully", {eventId, eventType});
      res.status(200).send("OK");
    } catch (error) {
      logger.error("Error processing webhook", {
        eventId,
        eventType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).send("Processing error");
    }
  });

async function processRevenueCatEvent(
  eventType: RevenueCatEventType,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): Promise<void> {
  const userRef = db.doc(`users/${userId}`);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    logger.warn("User not found for subscription event", {userId, eventType});
    return;
  }

  switch (eventType) {
  case "INITIAL_PURCHASE":
    await handleInitialPurchase(userRef, event);
    break;
  case "RENEWAL":
    await handleRenewal(userRef, event);
    break;
  case "CANCELLATION":
    await handleCancellation(userRef);
    break;
  case "EXPIRATION":
    await handleExpiration(userRef, userId);
    break;
  case "BILLING_ISSUE":
    await handleBillingIssue(userRef, userId);
    break;
  case "PRODUCT_CHANGE":
    await handleProductChange(userRef, event);
    break;
  case "TEST":
    logger.info("Test webhook received", {userId});
    break;
  default:
    logger.info("Unhandled event type", {eventType, userId});
  }
}

async function handleInitialPurchase(
  userRef: FirebaseFirestore.DocumentReference,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): Promise<void> {
  await userRef.update({
    subscriptionStatus: "active" as SubscriptionStatus,
    subscriptionPlan: event.product_id || "premium",
    subscriptionStartedAt: FieldValue.serverTimestamp(),
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
}

async function handleRenewal(
  userRef: FirebaseFirestore.DocumentReference,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): Promise<void> {
  await userRef.update({
    subscriptionStatus: "active" as SubscriptionStatus,
    subscriptionPlan: event.product_id,
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
}

async function handleCancellation(
  userRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  await userRef.update({
    subscriptionStatus: "cancelled" as SubscriptionStatus,
    subscriptionCancelledAt: FieldValue.serverTimestamp(),
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
}

async function handleExpiration(
  userRef: FirebaseFirestore.DocumentReference,
  userId: string
): Promise<void> {
  await userRef.update({
    subscriptionStatus: "expired" as SubscriptionStatus,
    subscriptionExpiredAt: FieldValue.serverTimestamp(),
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
  await notifyUserSubscriptionExpired(userId);
}

async function handleBillingIssue(
  userRef: FirebaseFirestore.DocumentReference,
  userId: string
): Promise<void> {
  await userRef.update({
    subscriptionStatus: "billing_issue" as SubscriptionStatus,
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
  await notifyUserBillingIssue(userId);
}

async function handleProductChange(
  userRef: FirebaseFirestore.DocumentReference,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): Promise<void> {
  await userRef.update({
    subscriptionPlan: event.product_id,
    subscriptionUpdatedAt: FieldValue.serverTimestamp(),
  });
}
