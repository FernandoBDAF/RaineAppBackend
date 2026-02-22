import * as functions from "firebase-functions/v1";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db, generateDeviceId} from "../utils/helpers";

const REGION = "us-west2";

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

export const refreshFcmToken = functions
  .region(REGION)
  .https.onCall(async (data, context): Promise<RefreshTokenResponse> => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = context.auth.uid;
    const {token, deviceId, platform, appVersion} = data as RefreshTokenRequest;

    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "Token is required");
    }

    logger.info("Refreshing FCM token", {userId, deviceId, platform});

    try {
      const finalDeviceId = deviceId || generateDeviceId();
      const deviceRef = db.doc(`users/${userId}/devices/${finalDeviceId}`);

      await deviceRef.set({
        fcmToken: token,
        platform: platform || "unknown",
        lastActive: FieldValue.serverTimestamp(),
        appVersion: appVersion || undefined,
      }, {merge: true});

      logger.info("FCM token updated", {userId, deviceId: finalDeviceId});

      return {success: true, deviceId: finalDeviceId};
    } catch (error) {
      logger.error("Error refreshing FCM token", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HttpsError("internal", "Failed to update token");
    }
  });
