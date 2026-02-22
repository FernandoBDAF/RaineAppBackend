/**
 * Raine Backend - User Creation Trigger
 * Creates user profile document when a new user signs up
 */

import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, generateUniqueReferralCode} from "../../utils/helpers";
import {User} from "../../types";

const REGION = "us-west2";

/**
 * Triggered when a new user is created in Firebase Auth
 * Creates a corresponding user profile document in Firestore
 */
export const onUserCreate = functions
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    const userId = user.uid;

    logger.info("New user created", {
      userId,
      email: user.email,
      provider: user.providerData?.[0]?.providerId || "unknown",
    });

    try {
      const referralCode = await generateUniqueReferralCode();

      // Create user profile document
      const userProfile: User = {
        uid: userId,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        subscriptionStatus: "free",
        notificationPreferences: {
          enabled: true,
          quietHoursStart: null,
          quietHoursEnd: null,
        },
        referralCode,
        createdAt: FieldValue.serverTimestamp(),
        lastSeen: FieldValue.serverTimestamp(),
      };

      await db.doc(`users/${userId}`).set(userProfile);

      logger.info("User profile created", {userId, referralCode});
    } catch (error: unknown) {
      const errObj = error as { code?: number; message?: string; details?: string };
      logger.error(
        `Error creating user profile for ${userId}: ` +
        `code=${errObj.code ?? "unknown"}, ` +
        `message=${errObj.message ?? "unknown"}, ` +
        `details=${errObj.details ?? "none"}`
      );
      throw error;
    }
  });
