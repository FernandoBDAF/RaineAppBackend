/**
 * Raine Backend - Refresh FCM Token
 * Callable function to register/update device FCM tokens
 */

import {onCall, HttpsError, CallableOptions} from "firebase-functions/v2/https";

const REGION = "us-west2";
const callableOptions: CallableOptions = {region: REGION};
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, generateDeviceId} from "../utils/helpers";

interface RefreshTokenRequest {
  token: string;
  deviceId?: string;
  platform?: "ios" | "android" | "unknown";
  appVersion?: string;
}

interface RefreshTokenResponse {
  success: boolean;
  deviceId: string;
}

/**
 * Register or update an FCM token for push notifications
 */
export const refreshFcmToken = onCall<RefreshTokenRequest>(
  callableOptions,
  async (request): Promise<RefreshTokenResponse> => {
  // Check authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.auth.uid;
    const {token, deviceId, platform, appVersion} = request.data;

    // Validate input
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "Token is required");
    }

    logger.info("Refreshing FCM token", {
      userId,
      deviceId,
      platform,
    });

    try {
    // Use existing deviceId or generate new one
      const finalDeviceId = deviceId || generateDeviceId();
      const deviceRef = db.doc(`users/${userId}/devices/${finalDeviceId}`);

      await deviceRef.set({
        fcmToken: token,
        platform: platform || "unknown",
        lastActive: FieldValue.serverTimestamp(),
        appVersion: appVersion || undefined,
      }, {merge: true});

      logger.info("FCM token updated", {userId, deviceId: finalDeviceId});

      return {
        success: true,
        deviceId: finalDeviceId,
      };
    } catch (error) {
      logger.error("Error refreshing FCM token", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HttpsError("internal", "Failed to update token");
    }
  });
