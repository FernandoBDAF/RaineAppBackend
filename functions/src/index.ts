/**
 * Raine Backend - Cloud Functions Entry Point
 *
 * This file exports all Cloud Functions for Firebase deployment.
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

export const REGION = "us-west2";

// ============================================================================
// Auth Triggers
// ============================================================================
export {onUserCreate} from "./triggers/auth/onUserCreate";
export {onUserDelete} from "./triggers/auth/onUserDelete";

// ============================================================================
// Firestore Triggers
// ============================================================================
export {onConnectionMessageCreated} from "./triggers/firestore/onConnectionMessageCreated";

// ============================================================================
// Callable Functions
// ============================================================================
export {refreshFcmToken} from "./callable/refreshFcmToken";
export {setTypingStatus} from "./callable/setTypingStatus";
export {markMessagesRead} from "./callable/markMessagesRead";
export {generateProfileBio} from "./callable/generateProfileBio";

// ============================================================================
// Scheduled Functions
// ============================================================================
export {processRetryQueue} from "./scheduled/processRetryQueue";
export {cleanupDevices} from "./scheduled/cleanupDevices";

// ============================================================================
// Webhooks
// ============================================================================
export {revenuecatWebhook} from "./webhooks/revenuecat";
