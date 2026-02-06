# Raine Backend - Complete Implementation Guide

**Project:** RaineApp Backend  
**Firebase Project:** raineapp-backend  
**Project ID:** 358132660024  
**Date:** February 2026  
**Status:** ✅ Successfully Deployed

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Summary](#implementation-summary)
4. [Challenges & Solutions](#challenges--solutions)
5. [Code Review & Integration](#code-review--integration)
6. [Complete Deployment Guide](#complete-deployment-guide)
7. [Testing & Verification](#testing--verification)
8. [Next Steps](#next-steps)

---

## Executive Summary

The Raine backend is a **serverless architecture** built on Firebase, providing real-time chat functionality, user management, subscription handling, and push notifications for the RaineApp mobile application.

### What Was Built

**Core Infrastructure:**
- 9 Cloud Functions (3 triggers, 3 callable, 2 scheduled, 1 webhook)
- Firestore database with security rules and composite indexes
- Firebase Storage with access control rules
- Google Secret Manager integration for secure credentials
- Cloud Build pipeline for automated deployments

**Key Features:**
- User lifecycle management (create, delete with GDPR compliance)
- Real-time messaging with push notifications
- FCM token management for multi-device support
- RevenueCat integration for subscription management
- Automatic retry queue for failed notifications
- Scheduled cleanup of stale data
- Rate limiting to prevent abuse

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20 |
| Language | TypeScript | 5.7.3 |
| Cloud Platform | Firebase (GCP) | Latest |
| Functions Framework | Cloud Functions v1 & v2 | 7.0.0 |
| Database | Cloud Firestore | Native mode |
| Storage | Firebase Cloud Storage | Latest |
| Region | us-west2 | N/A |

---

## Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      RaineApp (Mobile)                       │
│  React Native + Expo + @react-native-firebase/*             │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├──► Firebase Auth (Social Login)
                │
                ├──► Cloud Firestore (Real-time DB)
                │       ├── users/
                │       ├── rooms/
                │       ├── messages/
                │       └── notifications/
                │
                ├──► Cloud Functions (Backend Logic)
                │       ├── Auth Triggers
                │       ├── Firestore Triggers
                │       ├── Callable Functions
                │       ├── Scheduled Jobs
                │       └── Webhooks
                │
                ├──► Firebase Storage (Media Files)
                │
                └──► Firebase Cloud Messaging (Push)
                        │
                        └──► Apple Push Notification Service (APNs)
                        └──► Firebase Cloud Messaging (Android)

External Services:
    └──► RevenueCat (Subscriptions) ──► Webhook ──► Cloud Functions
```

### Data Flow

**User Registration:**
```
1. User signs up (Mobile App)
2. Firebase Auth creates account
3. onUserCreate trigger fires
4. User profile document created in Firestore
5. Mobile app receives user data
```

**Message Flow:**
```
1. User sends message (Mobile App)
2. Message written to Firestore (rooms/{roomId}/messages/{messageId})
3. onMessageCreated trigger fires
4. Room lastMessage updated
5. Push notifications sent to all members
6. If notification fails → queued for retry
```

**Subscription Flow:**
```
1. User purchases subscription (Mobile App via RevenueCat)
2. RevenueCat sends webhook to Cloud Functions
3. revenuecatWebhook function processes event
4. User subscriptionStatus updated in Firestore
5. Notifications sent if needed (billing issue, expiration)
```

---

## Implementation Summary

### Cloud Functions (9 Total)

#### 1. Authentication Triggers (2)

**`onUserCreate`** (Gen1, us-west2)
- **Trigger:** Firebase Auth user creation
- **Purpose:** Create user profile in Firestore
- **Location:** `functions/src/triggers/auth/onUserCreate.ts`
- **Key Features:**
  - Initializes user document with default settings
  - Sets free subscription status
  - Enables notifications by default
  - Records creation timestamp

**`onUserDelete`** (Gen1, us-west2)
- **Trigger:** Firebase Auth user deletion
- **Purpose:** GDPR-compliant data cleanup
- **Location:** `functions/src/triggers/auth/onUserDelete.ts`
- **Key Features:**
  - Deletes user profile
  - Removes all user devices
  - Cleans up room memberships
  - Deletes user notifications
  - Removes user reports
  - Cleans up rate limit records

#### 2. Firestore Triggers (1)

**`onMessageCreated`** (Gen1, us-west2)
- **Trigger:** New document in `rooms/{roomId}/messages/{messageId}`
- **Purpose:** Handle message notifications and room updates
- **Location:** `functions/src/triggers/firestore/onMessageCreated.ts`
- **Key Features:**
  - Idempotency (prevents duplicate processing)
  - Updates room lastMessage
  - Updates sender's lastSeen timestamp
  - Sends push notifications to room members
  - Queues failed notifications for retry
  - Transactional integrity

#### 3. Callable Functions (3)

**`refreshFcmToken`** (Gen2, us-west2)
- **Type:** HTTPS Callable
- **Purpose:** Register/update FCM tokens for push notifications
- **Location:** `functions/src/callable/refreshFcmToken.ts`
- **Parameters:**
  ```typescript
  {
    token: string;        // FCM token
    deviceId?: string;    // Optional device ID
    platform?: "ios" | "android" | "unknown";
    appVersion?: string;
  }
  ```
- **Returns:** `{ success: boolean; deviceId: string; }`

**`setTypingStatus`** (Gen2, us-west2)
- **Type:** HTTPS Callable
- **Purpose:** Update typing indicators in real-time
- **Location:** `functions/src/callable/setTypingStatus.ts`
- **Parameters:**
  ```typescript
  {
    roomId: string;
    isTyping: boolean;
  }
  ```
- **Features:**
  - Rate limited (10 requests per 10 seconds)
  - Membership verification
  - Auto-cleanup when not typing

**`markMessagesRead`** (Gen2, us-west2)
- **Type:** HTTPS Callable
- **Purpose:** Track read receipts for messages
- **Location:** `functions/src/callable/markMessagesRead.ts`
- **Parameters:**
  ```typescript
  {
    roomId: string;
    messageId?: string;  // Optional - marks all if omitted
  }
  ```
- **Features:**
  - Creates read receipt documents
  - Updates user's lastRead timestamp
  - Membership verification

#### 4. Scheduled Functions (2)

**`processRetryQueue`** (Gen2, us-west2)
- **Schedule:** Every 5 minutes
- **Purpose:** Retry failed push notifications
- **Location:** `functions/src/scheduled/processRetryQueue.ts`
- **Features:**
  - Processes up to 100 items per run
  - Maximum 3 retries per notification
  - Moves to dead-letter queue after max retries
  - Tracks retry count and errors

**`cleanupDevices`** (Gen2, us-west2)
- **Schedule:** Daily at 3:00 AM (us-west2 time)
- **Purpose:** Clean up stale data
- **Location:** `functions/src/scheduled/cleanupDevices.ts`
- **Features:**
  - Removes devices inactive for 30+ days
  - Deletes processed events older than 7 days
  - Cleans up stale typing indicators (10+ seconds)
  - Removes old rate limit records (24+ hours)

#### 5. Webhooks (1)

**`revenuecatWebhook`** (Gen2, us-west2)
- **Type:** HTTPS Endpoint
- **Purpose:** Process subscription lifecycle events from RevenueCat
- **Location:** `functions/src/webhooks/revenuecat.ts`
- **URL:** `https://us-west2-raineapp-backend.cloudfunctions.net/revenuecatWebhook`
- **Authentication:** Bearer token (stored in Secret Manager)
- **Supported Events:**
  - `INITIAL_PURCHASE` - New subscription
  - `RENEWAL` - Subscription renewed
  - `CANCELLATION` - User cancelled
  - `EXPIRATION` - Subscription expired
  - `BILLING_ISSUE` - Payment failed
  - `PRODUCT_CHANGE` - Subscription tier changed
  - `TEST` - Test event
- **Features:**
  - Webhook signature verification (timing-safe comparison)
  - Idempotency (prevents duplicate processing)
  - Automatic user status updates
  - Notifications for billing issues and expirations

### Firestore Security Rules

**Location:** `firestore/firestore.rules`

**Key Rules:**
- Users can only read/update their own profile
- Subscription fields are read-only (managed by Cloud Functions)
- Room access requires membership (optimized with `exists()`)
- Message queries enforce pagination limit (50 messages max)
- Soft delete pattern (delete flag, not actual deletion)
- Rate limit enforcement at database level

**Helper Functions:**
```javascript
function isAuthenticated()
function isOwner(userId)
function isRoomMember(roomId)  // Uses exists() for performance
function isRoomAdmin(roomId)
function enforcePaginationLimit(maxLimit)
```

### Firestore Indexes

**Location:** `firestore/firestore.indexes.json`

**Composite Indexes:**
1. Messages by sender and timestamp
2. Messages by deleted status and timestamp
3. Notifications by user and creation time
4. Notifications by user, read status, and creation time
5. User reports by status and creation time
6. User reports by reported user and creation time

### Storage Security Rules

**Location:** `storage/storage.rules`

**Key Rules:**
- Profile photos: Users can upload their own (5MB max)
- Room photos: Members can upload (5MB max)
- Message attachments: Members can upload (10MB max)
- All reads require authentication

### Services & Utilities

**Notification Service** (`functions/src/services/notifications.ts`)
- Multi-device push notification delivery
- Quiet hours support
- Automatic invalid token cleanup
- Message truncation (100 chars)
- Platform-specific payloads (APNs, FCM)

**Rate Limiting Service** (`functions/src/services/rateLimit.ts`)
- Per-user, per-action rate limits
- Sliding window algorithm
- Transactional consistency
- Configurable limits:
  - Message send: 30/minute
  - Room create: 10/hour
  - User report: 5/day
  - Typing status: 10/10 seconds

**Helpers** (`functions/src/utils/helpers.ts`)
- Firebase Admin SDK initialization
- Message truncation
- Quiet hours calculation
- Batch delete operations
- Timing-safe string comparison (for webhook security)

---

## Challenges & Solutions

### Challenge 1: Firebase Region Mismatch

**Problem:**  
Cloud Functions defaulted to `us-central1` but Firestore was in `us-west2`, causing deployment failures.

**Error:**
```
Could not authenticate 'service-358132660024@gcf-admin-robot.iam.gserviceaccount.com'
```

**Solution:**  
Explicitly set region in all function definitions:

```typescript
// Gen1 functions
export const onUserCreate = functions.region("us-west2").auth.user().onCreate(...)

// Gen2 functions
export const refreshFcmToken = onCall({ region: "us-west2" }, async (request) => ...)
```

**Files Updated:**
- All files in `functions/src/triggers/`
- All files in `functions/src/callable/`
- All files in `functions/src/scheduled/`
- All files in `functions/src/webhooks/`

---

### Challenge 2: Cloud Build Service Account Permissions

**Problem:**  
Cloud Build failed with permission errors during function deployment.

**Errors Encountered:**
1. "Access to bucket gcf-sources-* denied"
2. "Missing permission on build service account"
3. "Permission 'artifactregistry.repositories.uploadArtifacts' denied"
4. "Permission to view logs denied"

**Solution:**  
Added IAM roles to `358132660024-compute@developer.gserviceaccount.com`:

```bash
# Storage access
gcloud projects add-iam-policy-binding raineapp-backend \
  --member="serviceAccount:358132660024-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding raineapp-backend \
  --member="serviceAccount:358132660024-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Artifact Registry access
gcloud projects add-iam-policy-binding raineapp-backend \
  --member="serviceAccount:358132660024-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Logging access
gcloud projects add-iam-policy-binding raineapp-backend \
  --member="serviceAccount:358132660024-compute@developer.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

**Final IAM Configuration:**
- Cloud Functions Developer
- Service Account User
- Storage Object Viewer
- Storage Object Admin
- Artifact Registry Writer
- Logs Writer

---

### Challenge 3: Firestore Database Creation

**Problem:**  
Functions deployment failed because Firestore database "(default)" didn't exist.

**Error:**
```
Firestore database 'projects/raineapp-backend/databases/(default)' does not exist.
Please create a "(default)" Firestore Native database first.
```

**Solution:**  
1. Created Firestore database in Firebase Console
2. Selected **Standard edition** (not Enterprise)
3. Set Database ID to **(default)** (not custom name)
4. Selected location: **us-west2**
5. Verified Native mode (not Datastore mode)

**Important:** The database MUST be named "(default)" for Cloud Functions triggers to work automatically.

---

### Challenge 4: Firestore Index Configuration

**Problem:**  
Initial index configuration included single-field indexes which Firestore creates automatically.

**Error:**
```
Error: Request had HTTP Error: 400, this index is not necessary,
configure using single field index controls
```

**Solution:**  
Removed single-field indexes from `firestore.indexes.json`, keeping only composite indexes:

**Before (incorrect):**
```json
{
  "collectionGroup": "messages",
  "fields": [
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

**After (correct):**
```json
{
  "collectionGroup": "messages",
  "fields": [
    { "fieldPath": "senderId", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

---

### Challenge 5: ESLint Configuration

**Problem:**  
Firebase CLI's default ESLint config was too strict, failing on line length and JSDoc requirements.

**Errors:**
```
max-len: This line has a length of 103. Maximum allowed is 80
valid-jsdoc: Missing JSDoc for parameter 'userId'
@typescript-eslint/no-var-requires: Require statement not part of import statement
```

**Solution:**  
Updated `functions/.eslintrc.js` to relax rules:

```javascript
rules: {
  "quotes": ["error", "double"],
  "import/no-unresolved": 0,
  "indent": ["error", 2],
  "max-len": ["error", {"code": 120}],  // Increased from 80
  "valid-jsdoc": "off",                  // Disabled
  "require-jsdoc": "off",                // Disabled
  "@typescript-eslint/no-var-requires": "off",
  "@typescript-eslint/no-require-imports": "off",
}
```

---

### Challenge 6: Secrets Management Migration

**Problem:**  
Firebase deprecated `functions:config` in favor of Google Secret Manager.

**Error:**
```
DEPRECATION NOTICE: The functions.config() API is deprecated.
Deploys will fail once Runtime Config shuts down in March 2026.
```

**Solution:**  
Migrated to modern secrets management:

**Before (deprecated):**
```bash
firebase functions:config:set revenuecat.webhook_token="token"
```

**After (modern):**
```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
```

**Code Changes:**
```typescript
// Old approach
const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

// New approach
import { defineSecret } from "firebase-functions/params";
const revenuecatWebhookSecret = defineSecret("REVENUECAT_WEBHOOK_SECRET");

export const revenuecatWebhook = onRequest({
  secrets: [revenuecatWebhookSecret],
}, async (req, res) => {
  const webhookSecret = revenuecatWebhookSecret.value();
  // ...
});
```

**Local Testing:**
Created `.secret.local` file for emulator:
```
REVENUECAT_WEBHOOK_SECRET=your_test_token
```

---

### Challenge 7: App Engine Initialization

**Problem:**  
First deployment attempt failed because App Engine wasn't initialized.

**Error:**
```
There was an issue deploying your functions.
Verify that your project has a Google App Engine instance.
```

**Solution:**  
1. Navigated to: https://console.cloud.google.com/appengine?project=raineapp-backend
2. Clicked "Create Application"
3. Selected region: **us-west2**
4. No code deployment needed - just initialization

**Note:** App Engine is required as the underlying infrastructure for Cloud Functions.

---

### Challenge 8: React Native Firebase Plugin Configuration

**Problem:**  
Not all `@react-native-firebase/*` packages have Expo config plugins.

**Error:**
```
Package "@react-native-firebase/firestore" does not contain a valid config plugin.
Package "@react-native-firebase/analytics" does not contain a valid config plugin.
```

**Solution:**  
Only include packages with actual config plugins in `app.json`:

**Plugins Required:**
- `@react-native-firebase/app` (main plugin - MUST be first)
- `@react-native-firebase/crashlytics` (has native setup)

**Plugins NOT Needed:**
- `@react-native-firebase/auth` (works automatically)
- `@react-native-firebase/firestore` (works automatically)
- `@react-native-firebase/functions` (works automatically)
- `@react-native-firebase/storage` (works automatically)
- `@react-native-firebase/messaging` (setup handled separately)
- `@react-native-firebase/analytics` (works automatically)
- `@react-native-firebase/remote-config` (works automatically)

**Final `app.json` plugins:**
```json
"plugins": [
  ["expo-router", { "root": "src/app" }],
  "expo-dev-client",
  "@react-native-firebase/app",
  "@react-native-firebase/crashlytics"
]
```

---

## Code Review & Integration

### Backend-to-Frontend Integration Points

#### 1. Firebase Configuration

**Backend Setup:**
- Project ID: `raineapp-backend`
- Region: `us-west2`
- Bundle ID (iOS): `com.raine.app`
- Package Name (Android): `com.raine.app`

**Frontend Configuration Files:**

**iOS:** `RaineApp/GoogleService-Info.plist`
```xml
<key>BUNDLE_ID</key>
<string>com.raine.app</string>
<key>PROJECT_ID</key>
<string>raineapp-backend</string>
```

**Android:** `RaineApp/google-services.json`
```json
{
  "project_info": {
    "project_id": "raineapp-backend"
  },
  "client": [{
    "client_info": {
      "android_client_info": {
        "package_name": "com.raine.app"
      }
    }
  }]
}
```

**Expo App Config:** `RaineApp/app.json`
```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.raine.app",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "package": "com.raine.app",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

---

#### 2. Authentication Flow

**Backend:** `functions/src/triggers/auth/onUserCreate.ts`

**Trigger:** Firebase Auth user creation
**Action:** Creates user profile in Firestore

**Frontend Integration:**
```typescript
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Sign up
const userCredential = await auth().createUserWithEmailAndPassword(email, password);

// Wait for Cloud Function to create profile (automatic)
const userDoc = await firestore()
  .collection('users')
  .doc(userCredential.user.uid)
  .get();

const userData = userDoc.data();
// { uid, email, displayName, subscriptionStatus: 'free', ... }
```

**Flow:**
1. Frontend calls `auth().createUserWithEmailAndPassword()`
2. Firebase Auth creates account
3. Backend `onUserCreate` trigger fires automatically
4. User profile created in `users/{uid}` collection
5. Frontend listens for profile creation
6. User data available in app

---

#### 3. Messaging & Push Notifications

**Backend:** `functions/src/triggers/firestore/onMessageCreated.ts`

**Trigger:** New message created in Firestore
**Actions:**
- Updates room lastMessage
- Sends push notifications to members
- Queues failed notifications for retry

**Frontend Integration:**

**Sending Messages:**
```typescript
import firestore from '@react-native-firebase/firestore';

// Send message (triggers Cloud Function automatically)
await firestore()
  .collection('rooms')
  .doc(roomId)
  .collection('messages')
  .add({
    senderId: currentUser.uid,
    text: messageText,
    timestamp: firestore.FieldValue.serverTimestamp(),
    reactions: {},
    deleted: false,
    visible: true,
  });
```

**Receiving Messages:**
```typescript
import firestore from '@react-native-firebase/firestore';

// Real-time listener
const unsubscribe = firestore()
  .collection('rooms')
  .doc(roomId)
  .collection('messages')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .onSnapshot((snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setMessages(messages);
  });
```

**Push Notification Setup:**
```typescript
import messaging from '@react-native-firebase/messaging';
import functions from '@react-native-firebase/functions';

// Request permission
await messaging().requestPermission();

// Get FCM token
const token = await messaging().getToken();

// Register with backend
const refreshToken = functions().httpsCallable('refreshFcmToken');
await refreshToken({
  token,
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  appVersion: Constants.expoConfig?.version,
});

// Listen for messages
messaging().onMessage(async (remoteMessage) => {
  // Handle foreground notification
  console.log('Notification:', remoteMessage);
});
```

---

#### 4. Callable Functions

**Backend:** Callable functions in `functions/src/callable/`

**Frontend Integration:**

**Refresh FCM Token:**
```typescript
import functions from '@react-native-firebase/functions';

const refreshFcmToken = functions().httpsCallable('refreshFcmToken');
const result = await refreshFcmToken({
  token: fcmToken,
  deviceId: deviceId, // optional
  platform: 'ios',
  appVersion: '1.0.0',
});

console.log(result.data); // { success: true, deviceId: '...' }
```

**Set Typing Status:**
```typescript
import functions from '@react-native-firebase/functions';

const setTypingStatus = functions().httpsCallable('setTypingStatus');

// User starts typing
await setTypingStatus({ roomId, isTyping: true });

// User stops typing
await setTypingStatus({ roomId, isTyping: false });
```

**Mark Messages Read:**
```typescript
import functions from '@react-native-firebase/functions';

const markMessagesRead = functions().httpsCallable('markMessagesRead');

// Mark specific message
await markMessagesRead({ roomId, messageId });

// Mark all messages in room
await markMessagesRead({ roomId });
```

---

#### 5. Real-time Listeners

**Typing Indicators:**
```typescript
import firestore from '@react-native-firebase/firestore';

// Listen for typing users
const unsubscribe = firestore()
  .collection('rooms')
  .doc(roomId)
  .collection('typing')
  .onSnapshot((snapshot) => {
    const typingUsers = snapshot.docs
      .filter(doc => doc.data().isTyping)
      .map(doc => doc.id);
    setTypingUsers(typingUsers);
  });
```

**User Subscription Status:**
```typescript
import firestore from '@react-native-firebase/firestore';

// Listen for subscription changes
const unsubscribe = firestore()
  .collection('users')
  .doc(currentUser.uid)
  .onSnapshot((snapshot) => {
    const userData = snapshot.data();
    setSubscriptionStatus(userData?.subscriptionStatus);
  });
```

**Room Last Message:**
```typescript
import firestore from '@react-native-firebase/firestore';

// Listen for room updates
const unsubscribe = firestore()
  .collection('rooms')
  .doc(roomId)
  .onSnapshot((snapshot) => {
    const room = snapshot.data();
    setLastMessage(room?.lastMessage);
  });
```

---

#### 6. RevenueCat Integration

**Backend:** `functions/src/webhooks/revenuecat.ts`

**Frontend Integration:**
```typescript
import Purchases from 'react-native-purchases';

// Initialize RevenueCat
await Purchases.configure({
  apiKey: REVENUECAT_API_KEY,
  appUserID: currentUser.uid, // Important: use Firebase UID
});

// Purchase subscription
const { customerInfo } = await Purchases.purchasePackage(package);

// RevenueCat sends webhook to backend automatically
// Backend updates user subscription status in Firestore
// Frontend listens for changes via Firestore listener
```

**Subscription Status Flow:**
1. User purchases via RevenueCat in app
2. RevenueCat sends webhook to backend
3. Backend `revenuecatWebhook` processes event
4. User `subscriptionStatus` updated in Firestore
5. Frontend Firestore listener receives update
6. UI updates to show premium features

---

### Data Models

**User Document:** `users/{userId}`
```typescript
{
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  subscriptionStatus: "free" | "active" | "cancelled" | "expired" | "billing_issue";
  subscriptionPlan?: string;
  subscriptionStartedAt?: Timestamp;
  subscriptionUpdatedAt?: Timestamp;
  notificationPreferences: {
    enabled: boolean;
    quietHoursStart?: string;  // "HH:MM"
    quietHoursEnd?: string;    // "HH:MM"
  };
  createdAt: Timestamp;
  lastSeen?: Timestamp;
}
```

**Device Document:** `users/{userId}/devices/{deviceId}`
```typescript
{
  fcmToken: string;
  platform: "ios" | "android" | "unknown";
  lastActive: Timestamp;
  appVersion?: string;
}
```

**Room Document:** `rooms/{roomId}`
```typescript
{
  name: string;
  photoURL?: string;
  memberCount: number;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Message Document:** `rooms/{roomId}/messages/{messageId}`
```typescript
{
  senderId: string;
  text: string;
  timestamp: Timestamp;
  reactions?: Record<string, string[]>;
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  editedAt?: Timestamp;
  flagged?: boolean;
  visible?: boolean;
}
```

---

## Complete Deployment Guide

This guide provides step-by-step instructions to deploy the Raine backend from scratch.

### Prerequisites

- Google Cloud account with billing enabled
- Firebase project created
- Node.js 20+ installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- Git repository access

---

### Phase 1: Firebase Console Setup

#### Step 1.1: Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click "Add project"
3. Enter project name: `RaineApp`
4. Project ID will be auto-generated (e.g., `raineapp-backend`)
5. Enable Google Analytics (optional)
6. Click "Create project"

#### Step 1.2: Upgrade to Blaze Plan

1. In Firebase Console, click gear icon → "Usage and billing"
2. Click "Modify plan"
3. Select "Blaze (Pay as you go)"
4. Add payment method
5. Confirm upgrade

**Why:** Cloud Functions, Cloud Build, and Secret Manager require Blaze plan.

#### Step 1.3: Enable Authentication

1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable desired providers:
   - Email/Password (for testing)
   - Facebook, Instagram, LinkedIn (for production)

**Note:** Social providers require OAuth app configuration in respective platforms.

#### Step 1.4: Create Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Select **"Standard edition"**
4. Click "Next"
5. Database ID: **(default)** ← Important: must be exactly "(default)"
6. Location: **us-west2** ← Must match functions region
7. Start in **production mode** (security rules will be deployed later)
8. Click "Create Database"

#### Step 1.5: Enable Firebase Storage

1. In Firebase Console, go to "Storage"
2. Click "Get started"
3. Start in **production mode**
4. Location: **us-west2**
5. Click "Done"

#### Step 1.6: Register Mobile Apps

**iOS App:**
1. In Firebase Console, go to "Project settings"
2. Click "Add app" → iOS
3. iOS bundle ID: `com.raine.app`
4. App nickname: "Raine iOS"
5. Click "Register app"
6. Download `GoogleService-Info.plist`
7. Save to `RaineApp/GoogleService-Info.plist`

**Android App:**
1. Click "Add app" → Android
2. Android package name: `com.raine.app`
3. App nickname: "Raine Android"
4. Click "Register app"
5. Download `google-services.json`
6. Save to `RaineApp/google-services.json`

**Web App (optional for web client):**
1. Click "Add app" → Web
2. App nickname: "Raine Web"
3. Click "Register app"
4. Copy Firebase config object (for web SDK)

---

### Phase 2: Initialize App Engine

**Required for Cloud Functions:**

1. Go to: https://console.cloud.google.com/appengine
2. Select your project: `raineapp-backend`
3. Click "Create Application"
4. Select region: **us-west2**
5. Click "Create"

**Note:** No code needs to be deployed - just initialization.

---

### Phase 3: Configure IAM Permissions

#### Step 3.1: Grant Build Service Account Permissions

1. Go to: https://console.cloud.google.com/iam-admin/iam
2. Click "+ GRANT ACCESS"
3. New principal: `{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`
   - Replace `{PROJECT_NUMBER}` with your project number (e.g., 358132660024)
4. Add roles:
   - Cloud Functions Developer
   - Service Account User
5. Click "Save"

#### Step 3.2: Grant Compute Service Account Permissions

1. In IAM page, click "+ GRANT ACCESS"
2. New principal: `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`
3. Add roles:
   - Storage Object Viewer
   - Storage Object Admin
   - Artifact Registry Writer
   - Logs Writer
4. Click "Save"

**To find your project number:**
```bash
firebase projects:list
# Look in "Project Number" column
```

---

### Phase 4: Local Setup

#### Step 4.1: Clone and Navigate

```bash
cd /path/to/Raine/Raine-bk
```

#### Step 4.2: Install Firebase CLI

```bash
npm install -g firebase-tools

# Login
firebase login
```

#### Step 4.3: Initialize Firebase

```bash
# Select existing project
firebase use --add

# Select: raineapp-backend
# Alias: default
```

#### Step 4.4: Create Directory Structure

```bash
mkdir -p functions/src/triggers/auth
mkdir -p functions/src/triggers/firestore
mkdir -p functions/src/webhooks
mkdir -p functions/src/callable
mkdir -p functions/src/scheduled
mkdir -p functions/src/services
mkdir -p functions/src/utils
mkdir -p functions/src/types
mkdir -p firestore
mkdir -p storage
```

#### Step 4.5: Run Firebase Init

```bash
firebase init

# Select:
# - Firestore
# - Functions
# - Storage
# - Emulators

# Project: Use existing project → raineapp-backend
# Language: TypeScript
# ESLint: Yes
# Install dependencies: Yes
```

---

### Phase 5: Deploy Code

#### Step 5.1: Install Dependencies

```bash
cd functions
npm install
```

#### Step 5.2: Build TypeScript

```bash
npm run build
```

#### Step 5.3: Configure Secrets

```bash
cd /path/to/Raine/Raine-bk

# Generate webhook token
openssl rand -base64 32
# Copy output

# Create secret
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
# Paste token when prompted
```

**Save this token** - you'll need it for RevenueCat configuration later.

#### Step 5.4: Deploy Everything

```bash
cd /path/to/Raine/Raine-bk

firebase deploy
```

**Expected output:**
```
✔  firestore: deployed indexes successfully
✔  storage: released rules successfully
✔  functions[onUserCreate(us-west2)] Successful update operation
✔  functions[onUserDelete(us-west2)] Successful update operation
✔  functions[onMessageCreated(us-west2)] Successful update operation
✔  functions[refreshFcmToken(us-west2)] Successful update operation
✔  functions[setTypingStatus(us-west2)] Successful update operation
✔  functions[markMessagesRead(us-west2)] Successful update operation
✔  functions[processRetryQueue(us-west2)] Successful update operation
✔  functions[cleanupDevices(us-west2)] Successful update operation
✔  functions[revenuecatWebhook(us-west2)] Successful update operation

✔  Deploy complete!
```

---

### Phase 6: Verify Deployment

#### Step 6.1: Check Functions

```bash
firebase functions:list
```

**Expected: 9 functions listed**

#### Step 6.2: Test Webhook Endpoint

```bash
# Test with invalid token (should return 401)
curl -i -X POST https://us-west2-raineapp-backend.cloudfunctions.net/revenuecatWebhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-token" \
  -d '{"event": {"id": "test", "type": "TEST", "app_user_id": "user123"}}'

# Expected: HTTP 401 Unauthorized
```

#### Step 6.3: Check Firestore Rules

1. Go to Firebase Console → Firestore
2. Click "Rules" tab
3. Verify rules are deployed (not default)

#### Step 6.4: Check Storage Rules

1. Go to Firebase Console → Storage
2. Click "Rules" tab
3. Verify rules are deployed

---

### Phase 7: Configure RevenueCat (Optional)

#### Step 7.1: Add Webhook in RevenueCat Dashboard

1. Log in to https://app.revenuecat.com
2. Select your project
3. Go to Project Settings → Webhooks
4. Click "Add webhook"
5. URL: `https://us-west2-raineapp-backend.cloudfunctions.net/revenuecatWebhook`
6. Authorization Header: `Bearer {YOUR_TOKEN}`
   - Use the token from Step 5.3
7. Select events:
   - INITIAL_PURCHASE
   - RENEWAL
   - CANCELLATION
   - EXPIRATION
   - BILLING_ISSUE
   - PRODUCT_CHANGE
8. Click "Save"

#### Step 7.2: Test Webhook

1. In RevenueCat dashboard, find your webhook
2. Click "Send test event"
3. Check Cloud Functions logs:
   ```bash
   firebase functions:log
   ```
4. Look for "RevenueCat webhook received" message

---

### Phase 8: Frontend Integration

#### Step 8.1: Configure RaineApp

1. Ensure `GoogleService-Info.plist` is in `RaineApp/`
2. Ensure `google-services.json` is in `RaineApp/`
3. Verify `app.json` has correct configuration:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.raine.app",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "package": "com.raine.app",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-dev-client",
      "@react-native-firebase/app",
      "@react-native-firebase/crashlytics"
    ]
  }
}
```

#### Step 8.2: Build App with EAS

```bash
cd /path/to/Raine/RaineApp

# Build for iOS Simulator (fastest)
eas build --profile development-simulator --platform ios

# Or build for Android
eas build --profile development --platform android
```

**Build time:** ~15-20 minutes

#### Step 8.3: Install and Test

```bash
# Install on simulator/device
eas build:run --platform ios --latest

# Start dev server
npx expo start --dev-client
```

---

## Testing & Verification

### Manual Test Checklist

#### Test 1: User Registration
- [ ] Create new user via Firebase Auth
- [ ] Verify `onUserCreate` function logs in Functions dashboard
- [ ] Check Firestore for user document in `users/{uid}`
- [ ] Verify default subscription status is "free"

#### Test 2: Push Notifications
- [ ] Register FCM token using `refreshFcmToken` function
- [ ] Verify device document created in `users/{uid}/devices/{deviceId}`
- [ ] Send test notification from Firebase Console
- [ ] Verify notification received on device

#### Test 3: Messaging
- [ ] Create room document manually in Firestore
- [ ] Add current user to room members
- [ ] Send message via app or Firestore console
- [ ] Verify `onMessageCreated` function fires
- [ ] Verify room `lastMessage` updated
- [ ] Verify push notification sent to members

#### Test 4: RevenueCat Integration
- [ ] Send test webhook from RevenueCat dashboard
- [ ] Verify webhook function logs
- [ ] Check user `subscriptionStatus` updated
- [ ] Verify idempotency (send same event twice)

#### Test 5: Scheduled Functions
- [ ] Wait for `processRetryQueue` to run (check logs after 5 min)
- [ ] Wait for `cleanupDevices` to run (check logs after 3 AM)

#### Test 6: Security Rules
- [ ] Try to read another user's document (should fail)
- [ ] Try to update subscription status from client (should fail)
- [ ] Try to access room without membership (should fail)
- [ ] Query messages without limit (should work but capped at 50)

---

### Monitoring & Logs

#### View Function Logs
```bash
# All functions
firebase functions:log

# Specific function
firebase functions:log --only onUserCreate

# Follow logs in real-time
firebase functions:log --follow
```

#### View Logs in Console
1. Go to: https://console.cloud.google.com/functions
2. Click function name
3. Click "Logs" tab

#### Set Up Alerts
1. Go to: https://console.cloud.google.com/monitoring/alerting
2. Create alert for:
   - Function errors
   - High latency
   - Rate limit exceeded

---

## Next Steps

### Immediate (Required)

1. **Configure Social Authentication**
   - Set up Facebook OAuth app
   - Set up Instagram OAuth (via Facebook)
   - Set up LinkedIn OAuth
   - Add OAuth credentials to Firebase Auth

2. **Test End-to-End Flow**
   - User signup → profile creation
   - Send message → notifications
   - Purchase subscription → status update

### Short-term (Recommended)

3. **Set Up Monitoring**
   - Configure Cloud Monitoring alerts
   - Set up error notifications
   - Monitor function costs

4. **Add Admin Dashboard**
   - User management
   - Content moderation
   - Analytics

### Long-term (Enhancements)

5. **Performance Optimization**
   - Review function cold start times
   - Optimize Firestore queries
   - Implement caching where appropriate

6. **Feature Additions**
   - Direct messages (1-on-1 chat)
   - Voice/video calling
   - Story features
   - Advanced analytics

---

## Appendix

### File Structure

```
Raine-bk/
├── development/                    # Documentation
│   ├── 0-backlog.md
│   ├── 1-BACKEND-SETUP-MANUAL.md
│   ├── 1-backend-implementation-plan.md
│   ├── 2-EAS-BUILD-PLAN.md
│   └── 3-frontend-backend-requirements.md
├── documents/                      # This guide
│   └── IMPLEMENTATION-GUIDE.md
├── firestore/
│   ├── firestore.rules            # Security rules
│   └── firestore.indexes.json     # Composite indexes
├── functions/
│   ├── src/
│   │   ├── callable/              # Callable functions
│   │   │   ├── markMessagesRead.ts
│   │   │   ├── refreshFcmToken.ts
│   │   │   └── setTypingStatus.ts
│   │   ├── scheduled/             # Scheduled functions
│   │   │   ├── cleanupDevices.ts
│   │   │   └── processRetryQueue.ts
│   │   ├── services/              # Business logic
│   │   │   ├── notifications.ts
│   │   │   └── rateLimit.ts
│   │   ├── triggers/
│   │   │   ├── auth/              # Auth triggers
│   │   │   │   ├── onUserCreate.ts
│   │   │   │   └── onUserDelete.ts
│   │   │   └── firestore/         # Firestore triggers
│   │   │       └── onMessageCreated.ts
│   │   ├── types/                 # TypeScript types
│   │   │   └── index.ts
│   │   ├── utils/                 # Helper functions
│   │   │   └── helpers.ts
│   │   ├── webhooks/              # Webhooks
│   │   │   └── revenuecat.ts
│   │   └── index.ts               # Function exports
│   ├── package.json
│   ├── tsconfig.json
│   └── .eslintrc.js
├── storage/
│   └── storage.rules              # Storage security rules
├── firebase.json                  # Firebase config
└── .firebaserc                    # Project aliases
```

### Key Resources

- **Firebase Console:** https://console.firebase.google.com/project/raineapp-backend
- **Cloud Functions Dashboard:** https://console.cloud.google.com/functions?project=raineapp-backend
- **IAM & Admin:** https://console.cloud.google.com/iam-admin/iam?project=raineapp-backend
- **Firestore Console:** https://console.firebase.google.com/project/raineapp-backend/firestore
- **Firebase Documentation:** https://firebase.google.com/docs

### Support & Troubleshooting

**Common Issues:**
1. Permission denied errors → Check IAM roles
2. Function timeout → Increase timeout in function config
3. Quota exceeded → Check billing limits
4. Rate limit hit → Review rate limit settings

**Logs & Debugging:**
```bash
# Function logs
firebase functions:log

# Emulator testing
firebase emulators:start

# Check function status
firebase functions:list
```

---

## Conclusion

The Raine backend is a production-ready, scalable serverless architecture built on Firebase. It provides:

✅ **9 Cloud Functions** for user management, messaging, notifications, and subscriptions  
✅ **Secure Firestore rules** with membership-based access control  
✅ **Composite indexes** for optimized queries  
✅ **Rate limiting** to prevent abuse  
✅ **Idempotency** to prevent duplicate operations  
✅ **Retry mechanisms** for failed notifications  
✅ **GDPR compliance** with automatic data cleanup  
✅ **RevenueCat integration** for subscription management  
✅ **Complete monitoring** and logging

The system is ready for development testing and can be scaled to production with minimal changes.

---

**Document Version:** 1.0  
**Last Updated:** February 5, 2026  
**Author:** AI Assistant + Fernando Barroso  
**Status:** Complete ✅
