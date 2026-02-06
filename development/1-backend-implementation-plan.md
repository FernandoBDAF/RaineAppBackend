# Raine Backend Implementation Plan
## Firebase Infrastructure, Cloud Functions & Observability

> **Implementation Status:** MVP Deployed ✅  
> **Region:** us-west2  
> **Project ID:** raineapp-backend  
> **Deployed Functions:** 9/9  
> **Detailed deployment log:** See `documents/IMPLEMENTATION-GUIDE.md`

### Tech Stack (Implemented)
- **Authentication**: Firebase Auth (email/password enabled; social providers pending)
- **Database**: Cloud Firestore (Native mode, us-west2)
- **Serverless Functions**: Firebase Cloud Functions Gen1 + Gen2 (Node.js 20 / TypeScript)
- **Storage**: Firebase Cloud Storage (us-west2)
- **Secrets**: Google Secret Manager (replaces deprecated functions:config)
- **Webhooks**: RevenueCat webhooks → Cloud Functions
- **Monitoring**: Cloud Logging (configured)

### Not Yet Implemented
- Feature Flags (Firebase Remote Config) - deferred
- Analytics (Firebase Analytics → BigQuery) - deferred
- Performance Monitoring - deferred
- CI/CD pipeline - deferred
- Terraform IaC - deferred

---

## Phase 1: Project Foundation & Infrastructure Setup

### 1.1 Firebase Project Setup
- [ ] Create Firebase project in console
- [ ] Enable required services:
  - Authentication
  - Cloud Firestore
  - Cloud Functions
  - Cloud Storage
  - Remote Config
  - Analytics
  - Performance Monitoring
- [ ] Set up billing account (Blaze plan required for Cloud Functions)
- [ ] Configure project settings (regions, etc.)

### 1.2 Development Environment
- [ ] Install Firebase CLI: `npm install -g firebase-tools`
- [ ] Initialize Firebase project locally: `firebase init`
- [ ] Set up project structure:
```
/backend
  /functions              # Cloud Functions
    /src
      /triggers           # Event triggers
        /firestore
        /auth
        /pubsub
      /webhooks           # HTTP endpoints
      /services           # Business logic
        /notifications
        /subscriptions
        /analytics
      /utils              # Helper functions
      /types              # TypeScript types
      index.ts            # Functions export
    package.json
    tsconfig.json
  /firestore
    firestore.rules       # Security Rules
    firestore.indexes.json # Composite indexes
  /storage
    storage.rules         # Storage Security Rules
  /remoteconfig
    template.json         # Remote Config template
  /scripts                # Deployment scripts
  firebase.json
  .firebaserc
```

### 1.3 Version Control & CI/CD
- [ ] Initialize Git repository
- [ ] Create `.gitignore` (exclude secrets, node_modules, etc.)
- [ ] Set up GitHub Actions or Cloud Build for:
  - Firestore rules deployment
  - Functions deployment
  - Security rules testing
- [ ] Configure deployment environments:
  - Development
  - Staging
  - Production

### 1.4 Infrastructure as Code (Optional)
- [ ] Set up Terraform for Firebase resources:
  - Project configuration
  - Service enablement
  - IAM roles
  - BigQuery datasets
- [ ] Store Terraform state in Cloud Storage
- [ ] Document IaC workflow

### 1.5 Secrets & Environment Management
- [ ] Set up Firebase Functions configuration for non-sensitive config:
  ```bash
  # Set environment-specific config
  firebase functions:config:set \
    app.environment="production" \
    app.version="1.0.0"
  
  # View current config
  firebase functions:config:get
  ```
- [ ] Set up Google Secret Manager for sensitive secrets:
  ```bash
  # Create secrets
  gcloud secrets create revenuecat-webhook-token --replication-policy="automatic"
  gcloud secrets create revenuecat-api-key --replication-policy="automatic"
  
  # Add secret versions
  echo -n "your-secret-value" | gcloud secrets versions add revenuecat-webhook-token --data-file=-
  ```
- [ ] Access secrets in Cloud Functions:
  ```typescript
  import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

  const secretClient = new SecretManagerServiceClient();

  async function getSecret(secretName: string): Promise<string> {
    const projectId = process.env.GCLOUD_PROJECT;
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    const [version] = await secretClient.accessSecretVersion({ name });
    return version.payload?.data?.toString() || '';
  }

  // Or use Cloud Functions v2 with secret binding
  export const myFunction = functions
    .runWith({
      secrets: ['REVENUECAT_WEBHOOK_TOKEN', 'REVENUECAT_API_KEY']
    })
    .https.onRequest(async (req, res) => {
      // Secrets available as process.env.REVENUECAT_WEBHOOK_TOKEN
    });
  ```
- [ ] Document all required secrets:
  | Secret Name | Description | Used By |
  |-------------|-------------|---------|
  | `revenuecat-webhook-token` | Webhook auth token | RevenueCat webhook |
  | `revenuecat-api-key` | API key for RevenueCat | Subscription sync |
- [ ] Never commit secrets to version control
- [ ] Rotate secrets quarterly

---

## Phase 2: Authentication Setup

### 2.1 Firebase Auth Configuration
- [ ] Enable sign-in methods:
  - Email/Password
  - (Optional) Google Sign-In
  - (Optional) Apple Sign-In
- [ ] Configure auth domain
- [ ] Set up password policies
- [ ] Configure email templates (verification, password reset)

### 2.2 Auth Triggers (Cloud Functions)
- [ ] Implement `onCreate` trigger:
  ```typescript
  export const onUserCreate = auth.user().onCreate(async (user) => {
    // Create user profile in Firestore
    // Set default user properties
    // Send welcome notification (optional)
  });
  ```
- [ ] Implement `onDelete` trigger:
  ```typescript
  export const onUserDelete = auth.user().onDelete(async (user) => {
    // Clean up user data (GDPR compliance)
    // Remove from chat rooms
    // Delete user documents
  });
  ```

### 2.3 Custom Claims (Optional)
- [ ] Implement admin role claims
- [ ] Implement subscription tier claims (if needed)
- [ ] Create HTTP function to set custom claims

---

## Phase 3: Cloud Firestore Setup

### 3.1 Data Model Design
- [ ] Define Firestore collections:
  ```
  /users/{userId}
    - uid: string
    - email: string
    - displayName: string
    - photoURL: string
    - subscriptionStatus: string
    - createdAt: timestamp
    - lastSeen: timestamp
    - notificationPreferences: {
        enabled: boolean,
        quietHoursStart: string,
        quietHoursEnd: string
      }

  /users/{userId}/devices/{deviceId}
    - fcmToken: string
    - platform: 'ios' | 'android'
    - lastActive: timestamp
    - appVersion: string

  /users/{userId}/roomMemberships/{roomId}
    - joinedAt: timestamp
    - lastRead: timestamp
    - notificationsEnabled: boolean

  /rooms/{roomId}
    - name: string
    - photoURL: string (optional)
    - memberCount: number
    - lastMessage: { text, senderId, timestamp }
    - createdAt: timestamp
    - updatedAt: timestamp

  /rooms/{roomId}/members/{userId}
    - joinedAt: timestamp
    - role: string ('admin' | 'member')
    - notificationsEnabled: boolean

  /rooms/{roomId}/messages/{messageId}
    - senderId: string
    - text: string
    - timestamp: timestamp
    - reactions: { emoji: string[] }
    - deleted: boolean (soft delete)
    - deletedAt: timestamp (optional)
    - editedAt: timestamp (optional)

  /rooms/{roomId}/messages/{messageId}/readBy/{userId}
    - timestamp: timestamp

  /roomPresence/{roomId}/typing/{userId}
    - isTyping: boolean
    - updatedAt: timestamp

  /notifications/{notificationId}
    - userId: string
    - type: string
    - data: object
    - read: boolean
    - createdAt: timestamp

  /processedEvents/{eventId}
    - processedAt: timestamp
    - functionName: string

  /processedWebhooks/{webhookId}
    - processedAt: timestamp
    - eventType: string

  /notificationRetryQueue/{retryId}
    - roomId: string
    - message: object
    - error: string
    - createdAt: timestamp
    - retryCount: number
  ```

### 3.1.1 Data Model Design Decisions
- **Membership Subcollections**: Using `/rooms/{roomId}/members/{userId}` instead of `memberIds[]` array to support unlimited members and avoid 1MB document limit
- **Inverse Lookups**: `/users/{userId}/roomMemberships/{roomId}` enables efficient "my rooms" queries
- **Multi-device Support**: `/users/{userId}/devices/{deviceId}` supports notifications to multiple devices per user
- **Soft Deletes**: Messages use `deleted` flag for GDPR compliance and recovery
- **Ephemeral Data**: Typing indicators in separate collection for lower-cost frequent updates
- **Idempotency Tracking**: `processedEvents` and `processedWebhooks` prevent duplicate processing

### 3.2 Security Rules Implementation
- [ ] Write comprehensive Firestore Security Rules:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      
      // Helper functions
      function isAuthenticated() {
        return request.auth != null;
      }
      
      function isOwner(userId) {
        return request.auth.uid == userId;
      }
      
      // Check membership using exists() - more efficient than get()
      function isRoomMember(roomId) {
        return exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid));
      }
      
      // Validate pagination limits
      function hasValidLimit() {
        return request.query.limit <= 100;
      }
      
      // Users collection
      match /users/{userId} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated() && isOwner(userId);
        allow update: if isAuthenticated() && isOwner(userId);
        allow delete: if false; // Use soft delete via Cloud Functions
        
        // User devices subcollection
        match /devices/{deviceId} {
          allow read, write: if isAuthenticated() && isOwner(userId);
        }
        
        // User room memberships (inverse lookup)
        match /roomMemberships/{roomId} {
          allow read: if isAuthenticated() && isOwner(userId);
          allow write: if false; // Managed by Cloud Functions
        }
      }
      
      // Rooms collection
      match /rooms/{roomId} {
        allow read: if isAuthenticated() && isRoomMember(roomId);
        allow create: if isAuthenticated();
        allow update: if isAuthenticated() && isRoomMember(roomId);
        allow delete: if false; // Managed by Cloud Functions
        
        // Room members subcollection
        match /members/{memberId} {
          allow read: if isAuthenticated() && isRoomMember(roomId);
          allow create: if isAuthenticated() && 
            (isOwner(memberId) || isRoomMember(roomId));
          allow update: if isAuthenticated() && isRoomMember(roomId);
          allow delete: if isAuthenticated() && 
            (isOwner(memberId) || isRoomMember(roomId));
        }
        
        // Messages subcollection - uses exists() for efficient membership check
        match /messages/{messageId} {
          allow read: if isAuthenticated() && isRoomMember(roomId);
          allow list: if isAuthenticated() && isRoomMember(roomId) && hasValidLimit();
          allow create: if isAuthenticated() && 
            isRoomMember(roomId) &&
            request.resource.data.senderId == request.auth.uid &&
            request.resource.data.timestamp == request.time &&
            request.resource.data.deleted == false;
          allow update: if isAuthenticated() && 
            isRoomMember(roomId) &&
            // Only allow updating reactions or soft delete
            (request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['reactions', 'deleted', 'deletedAt']));
        }
        
        // Read receipts subcollection
        match /messages/{messageId}/readBy/{userId} {
          allow read: if isAuthenticated() && isRoomMember(roomId);
          allow write: if isAuthenticated() && isOwner(userId) && isRoomMember(roomId);
        }
      }
      
      // Room presence (typing indicators) - separate for performance
      match /roomPresence/{roomId}/typing/{userId} {
        allow read: if isAuthenticated() && 
          exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid));
        allow write: if isAuthenticated() && isOwner(userId) &&
          exists(/databases/$(database)/documents/rooms/$(roomId)/members/$(request.auth.uid));
      }
      
      // Notifications collection
      match /notifications/{notificationId} {
        allow read: if isAuthenticated() && 
          resource.data.userId == request.auth.uid;
        allow list: if isAuthenticated() && hasValidLimit();
        allow update: if isAuthenticated() && 
          resource.data.userId == request.auth.uid &&
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
        allow create, delete: if false; // Managed by Cloud Functions
      }
      
      // Processed events - Cloud Functions only
      match /processedEvents/{eventId} {
        allow read, write: if false;
      }
      
      // Processed webhooks - Cloud Functions only
      match /processedWebhooks/{webhookId} {
        allow read, write: if false;
      }
      
      // Notification retry queue - Cloud Functions only
      match /notificationRetryQueue/{retryId} {
        allow read, write: if false;
      }
    }
  }
  ```
- [ ] Test security rules with Firebase Emulator
- [ ] Deploy security rules: `firebase deploy --only firestore:rules`

### 3.2.1 Security Rules Design Decisions
- **exists() over get()**: Using `exists()` for membership checks is cheaper and faster than `get()` which loads entire documents
- **Pagination Limits**: Enforcing `request.query.limit <= 100` prevents expensive unbounded queries
- **Soft Deletes**: Messages can only be soft-deleted (setting `deleted: true`), not hard-deleted
- **Cloud Functions Only**: Critical collections like `processedEvents` are only writable by Cloud Functions
- **Field-Level Updates**: Messages can only update specific fields (reactions, deleted status)

### 3.3 Composite Indexes
- [ ] Create necessary indexes:
  ```json
  {
    "indexes": [
      {
        "collectionGroup": "messages",
        "queryScope": "COLLECTION",
        "fields": [
          { "fieldPath": "timestamp", "order": "DESCENDING" }
        ]
      },
      {
        "collectionGroup": "messages",
        "queryScope": "COLLECTION",
        "fields": [
          { "fieldPath": "deleted", "order": "ASCENDING" },
          { "fieldPath": "timestamp", "order": "DESCENDING" }
        ]
      },
      {
        "collectionGroup": "roomMemberships",
        "queryScope": "COLLECTION",
        "fields": [
          { "fieldPath": "lastRead", "order": "DESCENDING" }
        ]
      },
      {
        "collectionGroup": "notifications",
        "queryScope": "COLLECTION",
        "fields": [
          { "fieldPath": "userId", "order": "ASCENDING" },
          { "fieldPath": "read", "order": "ASCENDING" },
          { "fieldPath": "createdAt", "order": "DESCENDING" }
        ]
      },
      {
        "collectionGroup": "members",
        "queryScope": "COLLECTION_GROUP",
        "fields": [
          { "fieldPath": "joinedAt", "order": "DESCENDING" }
        ]
      }
    ],
    "fieldOverrides": [
      {
        "collectionGroup": "typing",
        "fieldPath": "updatedAt",
        "ttl": true
      }
    ]
  }
  ```
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes`

### 3.4 Pagination Strategy
- [ ] Implement cursor-based pagination (not offset-based):
  ```typescript
  // Service function for paginated messages
  async function getMessages(
    roomId: string,
    limit: number = 50,
    startAfterDoc?: FirebaseFirestore.DocumentSnapshot
  ) {
    let query = db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .where('deleted', '==', false)
      .orderBy('timestamp', 'desc')
      .limit(limit);
    
    if (startAfterDoc) {
      query = query.startAfter(startAfterDoc);
    }
    
    const snapshot = await query.get();
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      messages,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === limit
    };
  }
  ```
- [ ] Enforce pagination limits in security rules (max 100)
- [ ] Document pagination patterns for frontend team

### 3.5 Offline & Conflict Resolution Strategy
- [ ] Define conflict resolution strategies per collection:
  - **Messages**: Last-write-wins (server timestamp)
  - **User profiles**: Last-write-wins with merge
  - **Room settings**: Last-write-wins
  - **Read receipts**: Last-write-wins (always move forward)
- [ ] Add `updatedAt` timestamps to all mutable documents
- [ ] Document offline behavior expectations:
  ```typescript
  // Client-side: Enable offline persistence
  firebase.firestore().enablePersistence({
    synchronizeTabs: true
  });
  
  // All writes use server timestamp for conflict resolution
  const message = {
    text: text,
    senderId: userId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    deleted: false
  };
  ```
- [ ] Handle pending writes indicator in UI

---

## Phase 4: Cloud Functions - Message & Notification Triggers

### 4.1 Message Created Trigger
- [ ] Implement Firestore trigger on message creation with idempotency and error handling:
  ```typescript
  import * as functions from 'firebase-functions';
  import * as admin from 'firebase-admin';

  const db = admin.firestore();

  export const onMessageCreated = functions
    .runWith({
      timeoutSeconds: 60,
      memory: '256MB',
      maxInstances: 100
    })
    .firestore
    .document('rooms/{roomId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
      const eventId = context.eventId;
      const roomId = context.params.roomId;
      const messageId = context.params.messageId;
      const message = snap.data();
      
      // 1. Idempotency check - prevent duplicate processing on retries
      const eventRef = db.doc(`processedEvents/${eventId}`);
      const eventDoc = await eventRef.get();
      if (eventDoc.exists) {
        functions.logger.info('Event already processed, skipping', { eventId });
        return;
      }
      
      try {
        // 2. Use batch for atomic Firestore operations
        const batch = db.batch();
        
        // Update room's lastMessage
        const roomRef = db.doc(`rooms/${roomId}`);
        batch.update(roomRef, {
          lastMessage: {
            text: message.text,
            senderId: message.senderId,
            timestamp: message.timestamp
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Mark event as processed
        batch.set(eventRef, {
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          functionName: 'onMessageCreated'
        });
        
        await batch.commit();
        
        // 3. Send push notifications (can fail independently)
        await sendPushNotificationsWithRetry(roomId, messageId, message);
        
        // 4. Log analytics event
        functions.logger.info('Message processed successfully', {
          roomId,
          messageId,
          senderId: message.senderId
        });
        
      } catch (error) {
        functions.logger.error('Error processing message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          roomId,
          messageId
        });
        throw error; // Rethrow to trigger retry
      }
    });

  // Helper function with retry queue fallback
  async function sendPushNotificationsWithRetry(
    roomId: string,
    messageId: string,
    message: FirebaseFirestore.DocumentData
  ) {
    try {
      await sendPushNotifications(roomId, message);
    } catch (error) {
      // Queue for retry instead of failing the entire function
      await db.collection('notificationRetryQueue').add({
        roomId,
        messageId,
        message: {
          text: message.text,
          senderId: message.senderId,
          timestamp: message.timestamp
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0
      });
      
      functions.logger.warn('Notification queued for retry', {
        roomId,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  ```

### 4.1.1 Notification Retry Processor
- [ ] Implement scheduled retry for failed notifications:
  ```typescript
  export const processNotificationRetryQueue = functions
    .runWith({ timeoutSeconds: 300, memory: '256MB' })
    .pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
      const maxRetries = 3;
      const retryDocs = await db
        .collection('notificationRetryQueue')
        .where('retryCount', '<', maxRetries)
        .limit(50)
        .get();
      
      for (const doc of retryDocs.docs) {
        const data = doc.data();
        try {
          await sendPushNotifications(data.roomId, data.message);
          await doc.ref.delete();
          functions.logger.info('Retry successful', { docId: doc.id });
        } catch (error) {
          await doc.ref.update({
            retryCount: admin.firestore.FieldValue.increment(1),
            lastError: error instanceof Error ? error.message : 'Unknown error',
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      // Clean up failed retries older than 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expiredDocs = await db
        .collection('notificationRetryQueue')
        .where('retryCount', '>=', maxRetries)
        .where('createdAt', '<', cutoff)
        .limit(100)
        .get();
      
      const batch = db.batch();
      expiredDocs.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    });
  ```

### 4.2 Push Notification Service
- [ ] Implement notification service with multi-device support:
  ```typescript
  import * as admin from 'firebase-admin';
  import * as functions from 'firebase-functions';

  interface DeviceToken {
    token: string;
    userId: string;
    deviceId: string;
    platform: 'ios' | 'android';
  }

  async function sendPushNotifications(
    roomId: string, 
    message: { text: string; senderId: string; timestamp: any }
  ) {
    const db = admin.firestore();
    
    // Get room details
    const roomDoc = await db.doc(`rooms/${roomId}`).get();
    const room = roomDoc.data();
    if (!room) throw new Error(`Room ${roomId} not found`);
    
    // Get room members (excluding sender)
    const membersSnapshot = await db
      .collection(`rooms/${roomId}/members`)
      .get();
    
    const recipientIds = membersSnapshot.docs
      .map(doc => doc.id)
      .filter(id => id !== message.senderId);
    
    if (recipientIds.length === 0) return;
    
    // Get all device tokens for all recipients
    const deviceTokens: DeviceToken[] = [];
    
    for (const userId of recipientIds) {
      // Check user notification preferences
      const userDoc = await db.doc(`users/${userId}`).get();
      const user = userDoc.data();
      
      if (!user?.notificationPreferences?.enabled) continue;
      
      // Check quiet hours
      if (isInQuietHours(user.notificationPreferences)) continue;
      
      // Get all devices for this user
      const devicesSnapshot = await db
        .collection(`users/${userId}/devices`)
        .get();
      
      devicesSnapshot.docs.forEach(deviceDoc => {
        const device = deviceDoc.data();
        if (device.fcmToken) {
          deviceTokens.push({
            token: device.fcmToken,
            userId: userId,
            deviceId: deviceDoc.id,
            platform: device.platform
          });
        }
      });
    }
    
    if (deviceTokens.length === 0) {
      functions.logger.info('No valid tokens to send to', { roomId });
      return;
    }
    
    // Send multicast message
    const payload: admin.messaging.MulticastMessage = {
      notification: {
        title: room.name || 'New Message',
        body: truncateMessage(message.text, 100)
      },
      data: {
        roomId: roomId,
        senderId: message.senderId,
        type: 'new_message'
      },
      tokens: deviceTokens.map(d => d.token),
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      }
    };
    
    const response = await admin.messaging().sendEachForMulticast(payload);
    
    functions.logger.info('Push notifications sent', {
      roomId,
      totalTokens: deviceTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
    
    // Handle failed tokens (remove invalid ones)
    await handleFailedTokens(response, deviceTokens);
  }

  async function handleFailedTokens(
    response: admin.messaging.BatchResponse,
    deviceTokens: DeviceToken[]
  ) {
    const db = admin.firestore();
    const tokensToRemove: DeviceToken[] = [];
    
    response.responses.forEach((result, index) => {
      if (!result.success) {
        const error = result.error;
        // Remove tokens that are invalid or unregistered
        if (
          error?.code === 'messaging/invalid-registration-token' ||
          error?.code === 'messaging/registration-token-not-registered'
        ) {
          tokensToRemove.push(deviceTokens[index]);
        }
      }
    });
    
    // Batch delete invalid tokens
    if (tokensToRemove.length > 0) {
      const batch = db.batch();
      tokensToRemove.forEach(device => {
        const deviceRef = db.doc(`users/${device.userId}/devices/${device.deviceId}`);
        batch.delete(deviceRef);
      });
      await batch.commit();
      
      functions.logger.info('Removed invalid tokens', {
        count: tokensToRemove.length
      });
    }
  }

  function isInQuietHours(prefs: {
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = prefs.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = prefs.quietHoursEnd.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  function truncateMessage(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
  ```

### 4.2.1 FCM Token Management
- [ ] Implement token refresh callable function:
  ```typescript
  export const refreshFcmToken = functions.https.onCall(
    async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }
      
      const { deviceId, newToken, platform, appVersion } = data;
      const userId = context.auth.uid;
      
      if (!deviceId || !newToken) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'deviceId and newToken are required'
        );
      }
      
      const db = admin.firestore();
      const deviceRef = db.doc(`users/${userId}/devices/${deviceId}`);
      
      await deviceRef.set({
        fcmToken: newToken,
        platform: platform || 'unknown',
        appVersion: appVersion || 'unknown',
        lastActive: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      functions.logger.info('FCM token refreshed', {
        userId,
        deviceId,
        platform
      });
      
      return { success: true };
    }
  );

  // Clean up old devices that haven't been active
  export const cleanupStaleDevices = functions.pubsub
    .schedule('0 3 * * *') // 3 AM daily
    .onRun(async (context) => {
      const db = admin.firestore();
      const staleCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      
      // Get all users
      const usersSnapshot = await db.collection('users').get();
      
      for (const userDoc of usersSnapshot.docs) {
        const devicesSnapshot = await db
          .collection(`users/${userDoc.id}/devices`)
          .where('lastActive', '<', staleCutoff)
          .get();
        
        const batch = db.batch();
        devicesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        
        if (devicesSnapshot.docs.length > 0) {
          await batch.commit();
          functions.logger.info('Cleaned up stale devices', {
            userId: userDoc.id,
            count: devicesSnapshot.docs.length
          });
        }
      }
    });
  ```

### 4.3 Notification Preferences
- [ ] Add user notification preferences to Firestore
- [ ] Implement logic to respect notification settings
- [ ] Add quiet hours support (optional)

---

## Phase 5: Cloud Functions - Subscription Webhooks

### 5.1 RevenueCat Webhook Setup
- [ ] Create HTTP Cloud Function for RevenueCat webhooks with full security:
  ```typescript
  import * as functions from 'firebase-functions';
  import * as admin from 'firebase-admin';
  import * as crypto from 'crypto';

  const db = admin.firestore();

  export const revenuecatWebhook = functions
    .runWith({
      timeoutSeconds: 30,
      memory: '256MB'
    })
    .https.onRequest(async (req, res) => {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
      }
      
      // 1. Verify webhook signature
      if (!verifyRevenueCatSignature(req)) {
        functions.logger.warn('Invalid webhook signature', {
          ip: req.ip
        });
        res.status(401).send('Unauthorized');
        return;
      }
      
      const event = req.body.event;
      const webhookId = event.id;
      const userId = event.app_user_id;
      const eventType = event.type;
      
      // 2. Idempotency check - prevent duplicate processing
      const webhookRef = db.doc(`processedWebhooks/${webhookId}`);
      
      try {
        await db.runTransaction(async (transaction) => {
          const webhookDoc = await transaction.get(webhookRef);
          
          if (webhookDoc.exists) {
            functions.logger.info('Webhook already processed', { webhookId });
            return; // Already processed, skip
          }
          
          // Mark as processed first (in transaction)
          transaction.set(webhookRef, {
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType: eventType,
            userId: userId
          });
          
          // Process based on event type
          const userRef = db.doc(`users/${userId}`);
          
          switch (eventType) {
            case 'INITIAL_PURCHASE':
              transaction.update(userRef, {
                subscriptionStatus: 'active',
                subscriptionStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            case 'RENEWAL':
              transaction.update(userRef, {
                subscriptionStatus: 'active',
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            case 'CANCELLATION':
              transaction.update(userRef, {
                subscriptionStatus: 'cancelled',
                subscriptionCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            case 'EXPIRATION':
              transaction.update(userRef, {
                subscriptionStatus: 'expired',
                subscriptionExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            case 'BILLING_ISSUE':
              transaction.update(userRef, {
                subscriptionStatus: 'billing_issue',
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            case 'PRODUCT_CHANGE':
              transaction.update(userRef, {
                subscriptionStatus: 'active',
                subscriptionPlan: event.product_id,
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              break;
              
            default:
              functions.logger.info('Unhandled event type', { eventType });
          }
        });
        
        // 3. Send notifications for certain events (outside transaction)
        if (eventType === 'BILLING_ISSUE') {
          await notifyUserBillingIssue(userId);
        } else if (eventType === 'EXPIRATION') {
          await notifyUserSubscriptionExpired(userId);
        }
        
        // 4. Log analytics event
        functions.logger.info('Webhook processed successfully', {
          webhookId,
          userId,
          eventType
        });
        
        res.status(200).send('OK');
        
      } catch (error) {
        functions.logger.error('Webhook processing error', {
          webhookId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Return 500 so RevenueCat will retry
        res.status(500).send('Internal error');
      }
    });

  // Signature verification using timing-safe comparison
  function verifyRevenueCatSignature(req: functions.https.Request): boolean {
    const signature = req.headers['authorization'];
    const expectedToken = process.env.REVENUECAT_WEBHOOK_TOKEN || 
      functions.config().revenuecat?.webhook_token;
    
    if (!signature || !expectedToken) {
      return false;
    }
    
    // Extract bearer token if present
    const token = signature.startsWith('Bearer ') 
      ? signature.slice(7) 
      : signature;
    
    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(expectedToken)
      );
    } catch {
      return false;
    }
  }

  async function notifyUserBillingIssue(userId: string) {
    // Create in-app notification
    await db.collection('notifications').add({
      userId,
      type: 'billing_issue',
      title: 'Payment Issue',
      body: 'There was a problem processing your payment. Please update your payment method.',
      data: { action: 'update_payment' },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Send push notification
    const devicesSnapshot = await db.collection(`users/${userId}/devices`).get();
    const tokens = devicesSnapshot.docs
      .map(doc => doc.data().fcmToken)
      .filter(Boolean);
    
    if (tokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        notification: {
          title: 'Payment Issue',
          body: 'Please update your payment method to continue your subscription.'
        },
        data: { type: 'billing_issue' },
        tokens
      });
    }
  }

  async function notifyUserSubscriptionExpired(userId: string) {
    await db.collection('notifications').add({
      userId,
      type: 'subscription_expired',
      title: 'Subscription Expired',
      body: 'Your subscription has expired. Renew to continue enjoying premium features.',
      data: { action: 'renew_subscription' },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  ```

### 5.2 Subscription State Management
- [ ] Update user subscription status in Firestore (handled in webhook)
- [ ] Sync entitlements from RevenueCat (optional):
  ```typescript
  export const syncSubscriptionStatus = functions.https.onCall(
    async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }
      
      const userId = context.auth.uid;
      
      // Fetch latest status from RevenueCat API
      const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${functions.config().revenuecat.api_key}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const subscriberData = await response.json();
      const entitlements = subscriberData.subscriber?.entitlements || {};
      
      // Determine status from entitlements
      const isActive = Object.values(entitlements).some(
        (e: any) => e.expires_date > new Date().toISOString()
      );
      
      await db.doc(`users/${userId}`).update({
        subscriptionStatus: isActive ? 'active' : 'expired',
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { status: isActive ? 'active' : 'expired' };
    }
  );
  ```
- [ ] Send notifications on subscription events
- [ ] Log subscription analytics events

### 5.3 Webhook Security
- [ ] Implement webhook signature verification (timing-safe comparison)
- [ ] Store webhook token in Firebase Functions config:
  ```bash
  firebase functions:config:set revenuecat.webhook_token="your-secret-token"
  firebase functions:config:set revenuecat.api_key="your-api-key"
  ```
- [ ] Implement idempotency with `processedWebhooks` collection
- [ ] Log all webhook events for audit with structured logging
- [ ] Set up alerting for failed webhook processing

### 5.4 Webhook Cleanup
- [ ] Implement cleanup for old processed webhooks:
  ```typescript
  export const cleanupOldWebhooks = functions.pubsub
    .schedule('0 4 * * 0') // Weekly on Sunday at 4 AM
    .onRun(async (context) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
      
      const oldWebhooks = await db
        .collection('processedWebhooks')
        .where('processedAt', '<', cutoff)
        .limit(500)
        .get();
      
      const batch = db.batch();
      oldWebhooks.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      functions.logger.info('Cleaned up old webhooks', {
        count: oldWebhooks.docs.length
      });
    });
  ```

---

## Phase 6: Cloud Functions - Scheduled Tasks

### 6.1 Cleanup Functions
- [ ] Implement scheduled cleanup (Pub/Sub):
  ```typescript
  export const dailyCleanup = pubsub
    .schedule('0 2 * * *') // 2 AM daily
    .timeZone('America/Los_Angeles')
    .onRun(async (context) => {
      // Delete old notifications (> 30 days)
      await deleteOldNotifications();
      
      // Clean up expired sessions
      // Archive old messages (optional)
      // Update user stats
    });
  ```

### 6.2 Analytics Aggregation
- [ ] Schedule daily analytics aggregation:
  ```typescript
  export const aggregateDailyStats = pubsub
    .schedule('0 3 * * *')
    .onRun(async (context) => {
      // Aggregate user activity
      // Calculate room engagement metrics
      // Store in separate collection or BigQuery
    });
  ```

### 6.3 Subscription Status Sync
- [ ] Schedule periodic subscription status check:
  ```typescript
  export const syncSubscriptions = pubsub
    .schedule('0 4 * * *')
    .onRun(async (context) => {
      // Fetch latest subscription status from RevenueCat
      // Update Firestore if drifted
      // Handle edge cases
    });
  ```

---

## Phase 7: Cloud Functions - Moderation & Safety

### 7.1 Content Moderation
- [ ] Implement message moderation trigger:
  ```typescript
  export const moderateMessage = firestore
    .document('rooms/{roomId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
      const message = snap.data();
      
      // Check for spam, offensive content
      const isSafe = await moderateContent(message.text);
      
      if (!isSafe) {
        // Flag message
        await snap.ref.update({ flagged: true, visible: false });
        
        // Notify moderators
        await notifyModerators(context.params.messageId);
      }
    });
  ```

### 7.2 Rate Limiting
- [ ] Implement rate limiting service:
  ```typescript
  import * as admin from 'firebase-admin';
  import * as functions from 'firebase-functions';

  const db = admin.firestore();

  interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
  }

  const RATE_LIMITS: Record<string, RateLimitConfig> = {
    'message_send': { windowMs: 60 * 1000, maxRequests: 30 },      // 30 per minute
    'room_create': { windowMs: 60 * 60 * 1000, maxRequests: 10 },  // 10 per hour
    'report_user': { windowMs: 24 * 60 * 60 * 1000, maxRequests: 5 }, // 5 per day
  };

  export async function checkRateLimit(
    userId: string,
    action: string
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const config = RATE_LIMITS[action];
    if (!config) {
      throw new Error(`Unknown rate limit action: ${action}`);
    }
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const rateLimitRef = db.doc(`rateLimits/${userId}_${action}`);
    
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      const data = doc.data();
      
      // Clean up old timestamps and count current window
      const timestamps: number[] = data?.timestamps || [];
      const validTimestamps = timestamps.filter(t => t > windowStart);
      
      if (validTimestamps.length >= config.maxRequests) {
        // Rate limited
        const oldestInWindow = Math.min(...validTimestamps);
        const resetAt = new Date(oldestInWindow + config.windowMs);
        
        return {
          allowed: false,
          remaining: 0,
          resetAt
        };
      }
      
      // Add new timestamp
      validTimestamps.push(now);
      transaction.set(rateLimitRef, {
        timestamps: validTimestamps,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        allowed: true,
        remaining: config.maxRequests - validTimestamps.length,
        resetAt: new Date(now + config.windowMs)
      };
    });
  }

  // Middleware for callable functions
  export async function withRateLimit<T>(
    userId: string,
    action: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const { allowed, remaining, resetAt } = await checkRateLimit(userId, action);
    
    if (!allowed) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Rate limit exceeded. Try again after ${resetAt.toISOString()}`,
        { remaining, resetAt: resetAt.toISOString() }
      );
    }
    
    return fn();
  }
  ```
- [ ] Apply rate limiting to message sends:
  ```typescript
  export const sendMessage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    return withRateLimit(context.auth.uid, 'message_send', async () => {
      // Message sending logic
    });
  });
  ```
- [ ] Implement rate limiting for room creation
- [ ] Clean up old rate limit records:
  ```typescript
  export const cleanupRateLimits = functions.pubsub
    .schedule('0 5 * * *') // Daily at 5 AM
    .onRun(async (context) => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const oldRecords = await db
        .collection('rateLimits')
        .where('lastUpdated', '<', cutoff)
        .limit(500)
        .get();
      
      const batch = db.batch();
      oldRecords.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    });
  ```

### 7.3 User Reporting
- [ ] Create HTTP function for user reports:
  ```typescript
  export const reportUser = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { reportedUserId, reason, messageId, roomId, description } = data;
    const reporterId = context.auth.uid;
    
    // Rate limit reports
    return withRateLimit(reporterId, 'report_user', async () => {
      // Validate input
      if (!reportedUserId || !reason) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }
      
      // Create report
      const reportRef = await db.collection('userReports').add({
        reporterId,
        reportedUserId,
        reason,
        description: description || '',
        messageId: messageId || null,
        roomId: roomId || null,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Check for auto-ban threshold
      const recentReports = await db
        .collection('userReports')
        .where('reportedUserId', '==', reportedUserId)
        .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .get();
      
      if (recentReports.size >= 5) {
        // Auto-suspend user pending review
        await db.doc(`users/${reportedUserId}`).update({
          suspended: true,
          suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
          suspendReason: 'Multiple user reports'
        });
        
        functions.logger.warn('User auto-suspended', {
          userId: reportedUserId,
          reportCount: recentReports.size
        });
      }
      
      // Notify moderators
      await notifyModerators({
        type: 'user_report',
        reportId: reportRef.id,
        reportedUserId,
        reason
      });
      
      return { success: true, reportId: reportRef.id };
    });
  });
  ```
- [ ] Store reports in Firestore
- [ ] Notify moderators via email/Slack
- [ ] Implement auto-ban for severe violations (5+ reports in 7 days)

### 7.4 Soft Delete Implementation
- [ ] Implement soft delete for messages:
  ```typescript
  export const deleteMessage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { roomId, messageId } = data;
    const userId = context.auth.uid;
    
    const messageRef = db.doc(`rooms/${roomId}/messages/${messageId}`);
    const messageDoc = await messageRef.get();
    
    if (!messageDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Message not found');
    }
    
    const message = messageDoc.data();
    
    // Only sender can delete their own message
    if (message?.senderId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot delete others messages');
    }
    
    // Soft delete
    await messageRef.update({
      deleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId,
      // Optionally clear text for privacy
      text: '[Message deleted]'
    });
    
    return { success: true };
  });
  ```
- [ ] Implement hard delete scheduled job (for messages deleted > 30 days):
  ```typescript
  export const hardDeleteOldMessages = functions.pubsub
    .schedule('0 2 * * *')
    .onRun(async (context) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all rooms and check for soft-deleted messages
      const roomsSnapshot = await db.collection('rooms').get();
      
      for (const roomDoc of roomsSnapshot.docs) {
        const deletedMessages = await db
          .collection(`rooms/${roomDoc.id}/messages`)
          .where('deleted', '==', true)
          .where('deletedAt', '<', cutoff)
          .limit(100)
          .get();
        
        if (deletedMessages.docs.length > 0) {
          const batch = db.batch();
          deletedMessages.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          
          functions.logger.info('Hard deleted old messages', {
            roomId: roomDoc.id,
            count: deletedMessages.docs.length
          });
        }
      }
    });
  ```

### 7.5 Read Receipts & Typing Indicators
- [ ] Implement typing indicator management:
  ```typescript
  export const setTypingStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { roomId, isTyping } = data;
    const userId = context.auth.uid;
    
    // Verify membership
    const memberDoc = await db.doc(`rooms/${roomId}/members/${userId}`).get();
    if (!memberDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Not a room member');
    }
    
    const typingRef = db.doc(`roomPresence/${roomId}/typing/${userId}`);
    
    if (isTyping) {
      await typingRef.set({
        isTyping: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await typingRef.delete();
    }
    
    return { success: true };
  });

  // Auto-cleanup stale typing indicators
  export const cleanupTypingIndicators = functions.pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {
      const staleTime = new Date(Date.now() - 10 * 1000); // 10 seconds
      
      const roomsSnapshot = await db.collection('roomPresence').get();
      
      for (const roomDoc of roomsSnapshot.docs) {
        const staleTyping = await db
          .collection(`roomPresence/${roomDoc.id}/typing`)
          .where('updatedAt', '<', staleTime)
          .get();
        
        const batch = db.batch();
        staleTyping.docs.forEach(doc => batch.delete(doc.ref));
        
        if (staleTyping.docs.length > 0) {
          await batch.commit();
        }
      }
    });
  ```
- [ ] Implement read receipts:
  ```typescript
  export const markMessagesRead = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { roomId, messageIds } = data;
    const userId = context.auth.uid;
    
    // Verify membership
    const memberDoc = await db.doc(`rooms/${roomId}/members/${userId}`).get();
    if (!memberDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Not a room member');
    }
    
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    for (const messageId of messageIds) {
      const readByRef = db.doc(`rooms/${roomId}/messages/${messageId}/readBy/${userId}`);
      batch.set(readByRef, { timestamp: now });
    }
    
    // Update user's lastRead for this room
    const membershipRef = db.doc(`users/${userId}/roomMemberships/${roomId}`);
    batch.update(membershipRef, { lastRead: now });
    
    await batch.commit();
    
    return { success: true };
  });
  ```

---

## Phase 8: Firebase Remote Config

### 8.1 Remote Config Setup
- [ ] Define Remote Config parameters:
  ```json
  {
    "chatReactionsEnabled": {
      "defaultValue": { "value": "true" },
      "valueType": "BOOLEAN"
    },
    "maxMessagesPerDay": {
      "defaultValue": { "value": "1000" },
      "valueType": "NUMBER"
    },
    "subscriptionPaywallEnabled": {
      "defaultValue": { "value": "false" },
      "valueType": "BOOLEAN"
    },
    "maintenanceMode": {
      "defaultValue": { "value": "false" },
      "valueType": "BOOLEAN"
    }
  }
  ```

### 8.2 Conditional Targeting
- [ ] Set up conditions:
  - App version targeting
  - Platform targeting (iOS/Android)
  - Random percentage rollout
- [ ] Create parameter groups for A/B experiments

### 8.3 Config Versioning
- [ ] Implement config versioning strategy
- [ ] Document all config changes
- [ ] Test config updates in staging

---

## Phase 9: Firebase Storage & Media

### 9.1 Cloud Storage Setup
- [ ] Create storage buckets:
  - User profile photos
  - Message attachments (if supported)
  - Room images
- [ ] Configure CORS for web access

### 9.2 Storage Security Rules
- [ ] Implement Storage Security Rules:
  ```javascript
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /users/{userId}/profile/{filename} {
        allow read: if request.auth != null;
        allow write: if request.auth.uid == userId &&
          request.resource.size < 5 * 1024 * 1024 && // 5MB max
          request.resource.contentType.matches('image/.*');
      }
      
      match /rooms/{roomId}/attachments/{filename} {
        allow read: if request.auth != null;
        allow write: if request.auth != null &&
          request.resource.size < 10 * 1024 * 1024; // 10MB max
      }
    }
  }
  ```

### 9.3 Image Processing (Optional)
- [ ] Implement Cloud Function for image processing:
  - Resize uploaded images
  - Generate thumbnails
  - Optimize for web/mobile

---

## Phase 10: Monitoring & Observability

### 10.1 Cloud Logging
- [ ] Set up structured logging in Cloud Functions:
  ```typescript
  import * as functions from 'firebase-functions';

  functions.logger.info('Message created', {
    roomId: roomId,
    messageId: messageId,
    senderId: senderId
  });

  functions.logger.error('Notification failed', {
    error: error.message,
    userId: userId
  });
  ```
- [ ] Create log-based metrics
- [ ] Set up log exports to BigQuery (optional)

### 10.2 Cloud Monitoring Dashboards
- [ ] Create monitoring dashboards:
  - Cloud Functions execution times
  - Firestore read/write operations
  - Error rates
  - Active users (from Analytics)
  - Subscription metrics

### 10.3 Alerting
- [ ] Set up alerts for:
  - Function error rate > threshold
  - Function execution time > threshold
  - Firestore costs spike
  - Authentication failures spike
  - Storage quota warnings
- [ ] Configure notification channels (email, Slack, PagerDuty)

### 10.4 Performance Monitoring
- [ ] Enable Firebase Performance Monitoring SDK
- [ ] Track custom traces for:
  - Message send latency
  - Room load time
  - Subscription purchase flow
- [ ] Monitor network request metrics

### 10.5 Health Check Endpoint
- [ ] Implement health check for monitoring:
  ```typescript
  export const healthCheck = functions.https.onRequest(async (req, res) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
    
    // Check Firestore connectivity
    const firestoreStart = Date.now();
    try {
      await db.collection('_healthcheck').doc('ping').set({
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      checks.firestore = {
        status: 'healthy',
        latency: Date.now() - firestoreStart
      };
    } catch (error) {
      checks.firestore = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    // Check Auth service
    try {
      await admin.auth().getUser('nonexistent-user-id').catch(() => {});
      checks.auth = { status: 'healthy' };
    } catch (error) {
      checks.auth = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.K_REVISION || 'unknown',
      checks
    });
  });
  ```
- [ ] Set up uptime monitoring to ping health endpoint
- [ ] Configure PagerDuty/Slack alerts for health failures

### 10.6 Backup & Disaster Recovery
- [ ] Enable Firestore point-in-time recovery (PITR):
  - Navigate to Firebase Console → Firestore → Backups
  - Enable PITR for production database
  - Retention: 7 days (default)
- [ ] Set up scheduled exports to Cloud Storage:
  ```typescript
  // Using Cloud Scheduler + Cloud Function
  export const backupFirestore = functions.pubsub
    .schedule('0 1 * * *') // Daily at 1 AM
    .onRun(async (context) => {
      const projectId = process.env.GCLOUD_PROJECT || '';
      const bucket = `gs://${projectId}-backups`;
      const timestamp = new Date().toISOString().split('T')[0];
      
      const client = new admin.firestore.v1.FirestoreAdminClient();
      
      const [operation] = await client.exportDocuments({
        name: `projects/${projectId}/databases/(default)`,
        outputUriPrefix: `${bucket}/firestore/${timestamp}`,
        collectionIds: [] // Empty = all collections
      });
      
      functions.logger.info('Backup initiated', {
        operationName: operation.name
      });
    });
  ```
- [ ] Configure backup bucket lifecycle policy:
  ```bash
  # Keep backups for 30 days, then delete
  gsutil lifecycle set lifecycle-config.json gs://PROJECT-backups
  ```
  ```json
  {
    "lifecycle": {
      "rule": [
        {
          "action": { "type": "Delete" },
          "condition": { "age": 30 }
        }
      ]
    }
  }
  ```
- [ ] Document restore procedures:
  ```markdown
  ## Firestore Restore Procedures
  
  ### Option 1: Point-in-Time Recovery (PITR)
  1. Go to Firebase Console → Firestore → Backups
  2. Select the desired recovery point
  3. Click "Restore" → Creates new database with recovered data
  
  ### Option 2: Import from Export
  1. Identify backup timestamp in gs://PROJECT-backups/firestore/
  2. Run import command:
     ```
     gcloud firestore import gs://PROJECT-backups/firestore/YYYY-MM-DD
     ```
  
  ### Recovery Time Objectives
  - PITR: ~minutes (depends on database size)
  - Export Import: ~minutes to hours (depends on size)
  ```
- [ ] Test restore procedures quarterly

---

## Phase 11: Analytics & BigQuery Integration

### 11.1 Firebase Analytics Events
- [ ] Define standard analytics events (logged from client):
  - `sign_up`
  - `login`
  - `message_sent`
  - `room_created`
  - `subscription_started`
  - `subscription_cancelled`

### 11.2 BigQuery Export
- [ ] Enable BigQuery export for Firebase Analytics
- [ ] Create BigQuery project and dataset
- [ ] Configure daily export schedule

### 11.3 Custom Analytics Functions
- [ ] Create Cloud Functions to log custom events:
  ```typescript
  export const logCustomEvent = https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    await admin.analytics().logEvent({
      userId: context.auth.uid,
      eventName: data.eventName,
      eventParams: data.eventParams
    });
    
    return { success: true };
  });
  ```

### 11.4 Data Analysis Queries
- [ ] Create BigQuery views for common queries:
  - Daily active users (DAU)
  - Monthly active users (MAU)
  - Retention cohorts
  - Conversion funnels
  - Subscription churn rate

---

## Phase 12: Testing & Quality Assurance

### 12.1 Firebase Emulator Suite
- [ ] Set up Firebase Emulator Suite:
  ```bash
  firebase emulators:start
  ```
- [ ] Configure emulators for:
  - Authentication
  - Firestore
  - Cloud Functions
  - Cloud Storage

### 12.2 Unit Testing
- [ ] Write unit tests for Cloud Functions:
  ```typescript
  import * as test from 'firebase-functions-test';

  describe('onMessageCreated', () => {
    it('should update room lastMessage', async () => {
      // Test implementation
    });
    
    it('should send notifications to room members', async () => {
      // Test implementation
    });
  });
  ```
- [ ] Test Firestore Security Rules:
  ```typescript
  import * as firebase from '@firebase/rules-unit-testing';

  describe('Firestore Security Rules', () => {
    it('should allow authenticated user to read their profile', async () => {
      // Test implementation
    });
    
    it('should deny unauthenticated access', async () => {
      // Test implementation
    });
  });
  ```

### 12.3 Integration Testing
- [ ] Test end-to-end flows:
  - User signup → profile creation
  - Message send → notification delivery
  - Subscription webhook → Firestore update
- [ ] Test with real Firebase project (staging)

### 12.4 Load Testing
- [ ] Test Firestore query performance at scale
- [ ] Test Cloud Function cold start times
- [ ] Test concurrent user scenarios
- [ ] Identify bottlenecks and optimize

---

## Phase 13: Deployment & CI/CD

### 13.1 Deployment Script
- [ ] Create deployment script:
  ```bash
  #!/bin/bash
  # deploy.sh
  
  ENV=$1  # dev, staging, prod
  
  # Deploy Firestore rules
  firebase deploy --only firestore:rules --project $ENV
  
  # Deploy Firestore indexes
  firebase deploy --only firestore:indexes --project $ENV
  
  # Deploy Storage rules
  firebase deploy --only storage --project $ENV
  
  # Deploy Cloud Functions
  firebase deploy --only functions --project $ENV
  
  # Deploy Remote Config (manual verification required)
  # firebase deploy --only remoteconfig --project $ENV
  ```

### 13.2 GitHub Actions Workflow
- [ ] Set up GitHub Actions for CI/CD:
  ```yaml
  name: Deploy to Firebase

  on:
    push:
      branches:
        - main

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - name: Setup Node.js
          uses: actions/setup-node@v2
          with:
            node-version: '18'
        - name: Install dependencies
          run: cd functions && npm ci
        - name: Run tests
          run: cd functions && npm test
        - name: Deploy to Firebase
          env:
            FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
          run: |
            npm install -g firebase-tools
            firebase deploy --only functions,firestore,storage --project prod
  ```

### 13.3 Environment Management
- [ ] Create separate Firebase projects:
  - `raine-dev`
  - `raine-staging`
  - `raine-prod`
- [ ] Configure `.firebaserc`:
  ```json
  {
    "projects": {
      "dev": "raine-dev",
      "staging": "raine-staging",
      "prod": "raine-prod"
    }
  }
  ```

---

## Phase 14: Cost Optimization

### 14.1 Firestore Optimization
- [ ] Monitor Firestore usage:
  - Document reads/writes
  - Storage size
  - Bandwidth
- [ ] Optimize queries:
  - Use query limits
  - Implement pagination
  - Cache results where appropriate
- [ ] Archive old data (messages > 90 days)

### 14.2 Cloud Functions Optimization
- [ ] Optimize function memory allocation
- [ ] Reduce cold start times:
  - Minimize dependencies
  - Use lightweight libraries
  - Consider function warming (HTTP ping)
- [ ] Use appropriate runtime (Node.js 18+)
- [ ] Set max instances to prevent runaway costs

### 14.3 Storage Optimization
- [ ] Implement lifecycle policies:
  - Delete old temporary files
  - Move old files to Archive storage class
- [ ] Compress images before storage

### 14.4 Cost Alerts
- [ ] Set budget alerts in Cloud Billing
- [ ] Monitor daily costs
- [ ] Create cost attribution reports

---

## Phase 15: Optional Railway API (If Needed)

### 15.1 When to Add API
Add Railway API if:
- You need always-on low-latency endpoints
- Complex search/aggregation queries beyond Firestore
- Custom auth flows not supported by Firebase
- Long-running background jobs
- Third-party API integrations

### 15.2 Railway Setup
- [ ] Create Railway account and project
- [ ] Deploy Node.js/Express API
- [ ] Connect to Firestore (service account)
- [ ] Implement endpoints:
  - `/api/search` (complex queries)
  - `/api/admin/*` (admin operations)
  - `/api/webhooks/*` (third-party webhooks)

### 15.3 Hybrid Architecture
- [ ] Keep Firebase for:
  - Auth
  - Real-time Firestore listeners
  - Cloud Function triggers
  - Remote Config
- [ ] Use Railway API for:
  - Specialized endpoints
  - Heavy compute
  - Custom business logic

---

## Critical Success Factors

1. **Security Rules First**: Never ship without comprehensive Firestore Security Rules
   - Use `exists()` over `get()` for membership checks (cheaper, faster)
   - Enforce pagination limits in rules (`request.query.limit <= 100`)
   - Test all rules in emulator before deployment

2. **Idempotent Functions**: Design all triggers to be idempotent (handle retries safely)
   - Track processed events in `processedEvents` collection
   - Track processed webhooks in `processedWebhooks` collection
   - Always check for duplicate processing before executing logic

3. **Error Handling**: Every Cloud Function must have robust error handling and logging
   - Use structured logging with `functions.logger`
   - Queue failed operations for retry (notification retry queue)
   - Never swallow errors silently

4. **Transactional Integrity**: Use batches and transactions for multi-document updates
   - Batch Firestore operations for atomicity
   - Use transactions when reads and writes must be consistent
   - Handle partial failure scenarios gracefully

5. **Cost Awareness**: Monitor costs from day one; Firestore and Functions can scale fast
   - Set budget alerts in Cloud Billing
   - Monitor document reads/writes daily
   - Archive old data (messages > 90 days)

6. **Observability**: Set up monitoring and alerting before production launch
   - Health check endpoint with dependency checks
   - Dashboards for key metrics (errors, latency, costs)
   - PagerDuty/Slack alerts for critical failures

7. **Testing**: Test security rules and functions in emulator before deployment
   - Unit tests for all Cloud Functions
   - Security rules tests with `@firebase/rules-unit-testing`
   - Integration tests for end-to-end flows

8. **Cold Start Optimization**: Minimize Cloud Function cold start times (< 1s)
   - Minimize dependencies (no unused imports)
   - Use lightweight libraries
   - Consider function warming for critical paths

9. **Webhook Security**: Always verify webhook signatures (RevenueCat, etc.)
   - Use timing-safe comparison (`crypto.timingSafeEqual`)
   - Store tokens in Secret Manager, not code
   - Log all webhook events for audit

10. **Rate Limiting**: Protect against abuse with rate limiting on write operations
    - Message sends: 30/minute per user
    - Room creation: 10/hour per user
    - User reports: 5/day per user

11. **Gradual Rollout**: Use Remote Config for gradual feature rollouts
    - Percentage-based rollouts
    - Kill switches for problematic features
    - A/B testing support

12. **Backup & Recovery**: Ensure data can be recovered
    - Enable Point-in-Time Recovery (PITR)
    - Daily exports to Cloud Storage
    - Test restore procedures quarterly

13. **Multi-Device Support**: Design for users on multiple devices
    - FCM tokens per device, not per user
    - Clean up stale devices automatically
    - Handle token refresh properly

14. **Soft Deletes**: Support data recovery and GDPR compliance
    - Messages soft-deleted first, hard-deleted after 30 days
    - User deletion triggers comprehensive cleanup
    - Audit trail for deletions

---

## Key Dependencies & Tools

### Cloud Functions
```json
{
  "firebase-admin": "^12.x",
  "firebase-functions": "^5.x",
  "typescript": "^5.x",
  "@types/node": "^20.x",
  "@google-cloud/secret-manager": "^5.x"
}
```

### Testing
```json
{
  "firebase-functions-test": "^3.x",
  "@firebase/rules-unit-testing": "^3.x",
  "jest": "^29.x",
  "@types/jest": "^29.x",
  "supertest": "^6.x"
}
```

### Utilities
```json
{
  "date-fns": "^3.x"
}
```

**Note**: Minimize dependencies to reduce cold start times. Avoid heavy libraries like `lodash` - use native JS methods instead. Only add `axios` if you need HTTP calls beyond Firebase SDK.

---

## Implementation Phases Summary

**Foundation (Phases 1-3)**: Firebase setup, auth, Firestore, security rules
- Project setup and environment configuration
- Secrets management setup
- Authentication triggers
- Data model with scalable membership patterns
- Security rules with efficient membership checks
- Pagination and offline strategies

**Core Functions (Phases 4-7)**: Message triggers, notifications, webhooks, moderation
- Idempotent message triggers with retry handling
- Multi-device push notifications
- FCM token management
- RevenueCat webhook with signature verification
- Rate limiting implementation
- Content moderation
- Soft delete and read receipts

**Infrastructure (Phases 8-11)**: Remote Config, storage, monitoring, analytics
- Feature flags and A/B testing
- Storage with security rules
- Health checks and alerting
- Backup and disaster recovery
- BigQuery analytics export

**Quality & Launch (Phases 12-14)**: Testing, deployment, cost optimization
- Emulator-based testing
- CI/CD with GitHub Actions
- Cost monitoring and optimization

**Post-Launch (Phase 15)**: Optional Railway API if needed

---

## Monitoring Checklist (Post-Launch)

### Daily
- [ ] Check error logs and alerts (Cloud Logging)
- [ ] Monitor health check endpoint status
- [ ] Review failed notification retry queue
- [ ] Check for rate limit violations

### Weekly
- [ ] Review cost reports and optimize
- [ ] Analyze analytics and user behavior
- [ ] Check webhook processing success rate
- [ ] Review subscription status sync accuracy

### Monthly
- [ ] Review security rules and update as needed
- [ ] Audit Cloud Function performance and cold starts
- [ ] Review and clean up stale devices
- [ ] Analyze rate limiting thresholds

### Quarterly
- [ ] Review and archive old data (messages > 90 days)
- [ ] Update dependencies and security patches
- [ ] Rotate API keys and secrets
- [ ] **Test backup restore procedures**
- [ ] Review and update documentation

---

## Documentation Requirements

- [ ] API documentation (if Railway API added)
- [ ] Cloud Functions documentation (trigger logic, data flows)
- [ ] Security Rules documentation (permissions, edge cases)
- [ ] Data model documentation (collections, relationships, indexes)
- [ ] Secrets inventory (what secrets exist, where they're used)
- [ ] Runbook for common operations:
  - Deploy new function
  - Update security rules
  - Roll back deployment
  - Debug production issues
  - Handle webhook failures
  - **Restore from backup**
  - **Rotate secrets**
  - **Handle rate limit complaints**
  - **Investigate failed notifications**
- [ ] Architecture diagrams (data flow, trigger flow)
- [ ] Cost breakdown and optimization guide
- [ ] Pagination patterns for frontend team
- [ ] Offline behavior expectations
- [ ] Error handling patterns and error codes

---

## Notes

- **Firestore Offline**: Leverage Firestore's built-in offline persistence on the client
  - Enable `synchronizeTabs: true` for multi-tab support
  - Use server timestamps for conflict resolution
  - Show pending write indicators to users

- **Cloud Functions Cold Starts**: Expect 1-5s cold start; optimize dependencies
  - Keep functions focused and small
  - Lazy-load heavy dependencies
  - Consider min instances for critical functions (costs more)

- **Security Rules**: These are your primary defense—never bypass them
  - Use `exists()` over `get()` for membership checks
  - Enforce pagination limits
  - Test exhaustively in emulator

- **Data Model Decisions**:
  - Membership in subcollections (not arrays) for scalability
  - Inverse lookups for efficient "my rooms" queries
  - Soft deletes for recovery and compliance
  - Multi-device token storage

- **BigQuery**: Essential for advanced analytics and data science
  - Enable daily export from Firebase Analytics
  - Create views for common queries (DAU, MAU, retention)
  - Use for subscription churn analysis

- **Remote Config**: Use for gradual rollouts and kill switches
  - Percentage-based feature rollouts
  - Platform-specific configurations
  - Maintenance mode toggle

- **RevenueCat Webhooks**: Essential for keeping Firestore in sync
  - Always verify signatures with timing-safe comparison
  - Implement idempotency to handle retries
  - Webhook is source of truth for subscription state

- **Railway API**: Add only if Firebase limitations become real bottlenecks
  - Complex search/aggregation
  - Long-running background jobs
  - Third-party API integrations

- **Cost Control**: Set budgets and alerts; Firestore and Functions can scale fast
  - Set billing alerts at 50%, 80%, 100% of budget
  - Monitor daily costs
  - Archive old messages and notifications
  - Clean up stale data regularly

- **Error Recovery**: Plan for failures
  - Notification retry queue for failed push notifications
  - Processed event tracking for idempotency
  - Graceful degradation when dependencies fail

- **GDPR Compliance**: Design for data privacy
  - Soft delete messages with 30-day hard delete
  - User deletion cascades to all user data
  - Export user data on request (callable function)
