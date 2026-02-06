# Frontend-Backend Requirements Mapping
## Backend Implementations Required to Support Frontend Features

This document maps frontend features from the Raine mobile app to their required backend implementations. It serves as a bridge between the frontend team and backend development, ensuring all necessary infrastructure is in place.

**Related Documents:**
- [Backend Implementation Plan](./backend-implementation-plan.md) - Comprehensive backend architecture and implementation details
- Frontend: `RaineApp-fb/docs/profile-setup-implementation-plan.md` - Profile setup flow specifications

---

## Table of Contents

1. [Profile Setup Flow](#1-profile-setup-flow)
2. [Authentication](#2-authentication)
3. [User Profile Management](#3-user-profile-management)
4. [Waitlist & Geo-Gating](#4-waitlist--geo-gating)
5. [AI Bio Generation](#5-ai-bio-generation)
6. [Photo Upload & Storage](#6-photo-upload--storage)
7. [Subscriptions](#7-subscriptions)
8. [Chat & Messaging](#8-chat--messaging)
9. [Push Notifications](#9-push-notifications)
10. [Feature Flags](#10-feature-flags)
11. [Implementation Priority Matrix](#11-implementation-priority-matrix)

---

## 1. Profile Setup Flow

### Frontend Feature
14-screen onboarding flow collecting user profile data (name, photo, location, preferences, children, etc.)

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| User document creation | Firestore `users/{uid}` collection | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Profile data storage | User document with all ProfileSetupData fields | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Security rules | Allow authenticated users to read/write own profile | [Phase 3.2](./backend-implementation-plan.md#32-security-rules-implementation) |
| Profile completion flag | `profileSetupCompleted: boolean` field | Custom addition |

### Firestore Schema Addition

```typescript
// Addition to /users/{userId} document
interface UserProfileSetup {
  // Screen 1: Name
  firstName: string;
  lastInitial: string;
  
  // Screen 2: Photo
  photoURL: string;
  
  // Screen 3: Location
  zipCode: string;
  city: string;
  state: string;
  county: string;
  
  // Screen 4: City Feel
  cityFeel: 'rooted' | 'finding_footing' | 'local_but_missing';
  
  // Screen 5: Children
  childCount: number;
  isExpecting: boolean;
  dueDate: { month: number; year: number } | null;
  children: Array<{
    name: string;
    birthMonth: number;
    birthYear: number;
  }>;
  
  // Screen 6: Before Motherhood
  beforeMotherhood: Array<'travel' | 'hosting' | 'movement' | 'nature' | 'culture' | 'career'>;
  
  // Screen 7: Perfect Weekend
  perfectWeekend: Array<'adventure' | 'slow_mornings' | 'good_company' | 'discovery' | 'movement' | 'family'>;
  
  // Screen 8: Feel Like Yourself
  feelYourself: 'alone_time' | 'partner_time' | 'friends_night' | 'change_scenery';
  
  // Screen 9: Hard Truths
  hardTruths: Array<'lose_myself' | 'recovery_time' | 'mental_load' | 'little_sleep' | 'grief_joy' | 'relationship_change'>;
  
  // Screen 10: Unexpected Joys
  unexpectedJoys: Array<'deeper_love' | 'person_becoming' | 'body_resilience' | 'partner_parent' | 'function_no_sleep' | 'fierce_instincts'>;
  
  // Screen 11: Aesthetic
  aesthetic: Array<'clean_minimal' | 'natural_textured' | 'classic_timeless' | 'eclectic_collected' | 'coastal_casual' | 'refined_essentials'>;
  
  // Screen 12: Mom Friend Style
  momFriendStyle: Array<'coffee_dates' | 'playdates' | 'group_hangouts' | 'virtual_chats' | 'weekend_family' | 'workout_buddies'>;
  
  // Screen 13: What Brought You
  whatBroughtYou: 'new_here' | 'friends_no_kids' | 'moms_who_get_it' | 'deeper_connections';
  
  // Screen 14: Bio
  generatedBio: string;
  bioApproved: boolean;
  
  // Meta
  profileSetupCompleted: boolean;
  profileSetupCompletedAt: Timestamp;
}
```

### Security Rules Addition

```javascript
// Add to firestore.rules under /users/{userId}
// Allow update of profile setup fields
allow update: if isAuthenticated() && isOwner(userId) &&
  // Validate required fields on completion
  (!request.resource.data.profileSetupCompleted || 
    (request.resource.data.firstName != '' &&
     request.resource.data.photoURL != '' &&
     request.resource.data.zipCode != ''));
```

---

## 2. Authentication

### Frontend Feature
Email/password login, optional social login (Google, Apple)

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Firebase Auth setup | Enable email/password provider | [Phase 2.1](./backend-implementation-plan.md#21-firebase-auth-configuration) |
| User onCreate trigger | Create user document on signup | [Phase 2.2](./backend-implementation-plan.md#22-auth-triggers-cloud-functions) |
| User onDelete trigger | GDPR-compliant data cleanup | [Phase 2.2](./backend-implementation-plan.md#22-auth-triggers-cloud-functions) |
| Password policies | Minimum 8 chars, complexity rules | [Phase 2.1](./backend-implementation-plan.md#21-firebase-auth-configuration) |

### Auth Trigger for Profile Setup

```typescript
// Extend onUserCreate trigger to initialize profile setup state
export const onUserCreate = auth.user().onCreate(async (user) => {
  await db.doc(`users/${user.uid}`).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    subscriptionStatus: 'none',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    
    // Profile setup initialization
    profileSetupCompleted: false,
    firstName: '',
    lastInitial: '',
    zipCode: '',
    city: '',
    state: '',
    county: '',
    cityFeel: null,
    childCount: 0,
    isExpecting: false,
    dueDate: null,
    children: [],
    beforeMotherhood: [],
    perfectWeekend: [],
    feelYourself: null,
    hardTruths: [],
    unexpectedJoys: [],
    aesthetic: [],
    momFriendStyle: [],
    whatBroughtYou: null,
    generatedBio: '',
    bioApproved: false,
    
    // Notification preferences
    notificationPreferences: {
      enabled: true,
      quietHoursStart: null,
      quietHoursEnd: null
    }
  });
});
```

---

## 3. User Profile Management

### Frontend Feature
View and edit user profile, display in-app

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Read user profile | Firestore real-time listener | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Update profile | Direct Firestore write | [Phase 3.2](./backend-implementation-plan.md#32-security-rules-implementation) |
| Profile photo URL | Firebase Storage reference | [Phase 9.1](./backend-implementation-plan.md#91-cloud-storage-setup) |
| Display name generation | `firstName + " " + lastInitial` | Client-side |

### Callable Function: Update Profile

```typescript
// Optional callable for validated profile updates
export const updateUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const allowedFields = [
    'firstName', 'lastInitial', 'photoURL', 'cityFeel',
    'beforeMotherhood', 'perfectWeekend', 'feelYourself',
    'hardTruths', 'unexpectedJoys', 'aesthetic', 'momFriendStyle',
    'whatBroughtYou', 'generatedBio', 'bioApproved'
  ];
  
  // Filter to allowed fields only
  const updates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }
  
  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  
  await db.doc(`users/${userId}`).update(updates);
  
  return { success: true };
});
```

---

## 4. Waitlist & Geo-Gating

### Frontend Feature
Location screen (Screen 3) with zip code validation and Bay Area geo-gate. Out-of-area users added to waitlist.

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Waitlist collection | Firestore `waitlist` collection | New collection |
| Email storage | Store email, location, timestamp | New collection |
| Admin access | Read-only for admin dashboard | Security rules |

### Firestore Schema

```typescript
// /waitlist/{documentId}
interface WaitlistEntry {
  email: string;
  zipCode: string;
  city: string;
  state: string;
  county: string;
  source: 'onboarding' | 'landing_page' | 'referral';
  createdAt: Timestamp;
  notified: boolean;
  notifiedAt?: Timestamp;
}
```

### Security Rules

```javascript
// Waitlist collection - write only (no read for users)
match /waitlist/{entryId} {
  // Anyone can add themselves to waitlist
  allow create: if request.resource.data.email is string &&
    request.resource.data.email.matches('.*@.*\\..*') &&
    request.resource.data.zipCode is string &&
    request.resource.data.source in ['onboarding', 'landing_page', 'referral'];
  
  // No read/update/delete for regular users
  allow read, update, delete: if false;
}
```

### Approved Counties (Reference)

The following SF Bay Area counties are approved for the app:

| County | Status |
|--------|--------|
| San Francisco | ✅ Approved |
| Marin | ✅ Approved |
| Contra Costa | ✅ Approved |
| Alameda | ✅ Approved |
| San Mateo | ✅ Approved |
| Santa Clara | ✅ Approved |
| Sonoma | ✅ Approved |
| Napa | ✅ Approved |

**Note:** Zip code to county mapping is handled client-side via a static lookup table. Backend stores the county for analytics purposes.

---

## 5. AI Bio Generation

### Frontend Feature
Screen 14 generates a personalized bio using AI based on all profile data collected.

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Cloud Function | `generateProfileBio` callable | New function |
| OpenAI integration | GPT-4o-mini API call | Secret Manager |
| Rate limiting | Max 5 calls per user per day | [Phase 7.2](./backend-implementation-plan.md#72-rate-limiting) |
| Secrets | OpenAI API key | [Phase 1.5](./backend-implementation-plan.md#15-secrets--environment-management) |

### Cloud Function Implementation

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

const db = admin.firestore();

interface ProfileBioRequest {
  profile: {
    firstName: string;
    city: string;
    state: string;
    cityFeel: string;
    childCount: number;
    children: Array<{ name: string; birthMonth: number; birthYear: number }>;
    beforeMotherhood: string[];
    perfectWeekend: string[];
    feelYourself: string;
    aesthetic: string[];
    whatBroughtYou: string;
  };
  feedback?: string;
  regenerate?: boolean;
}

export const generateProfileBio = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
    secrets: ['OPENAI_API_KEY']
  })
  .https.onCall(async (data: ProfileBioRequest, context) => {
    // 1. Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const userId = context.auth.uid;
    
    // 2. Rate limiting (5 per day)
    const today = new Date().toISOString().split('T')[0];
    const rateLimitRef = db.doc(`bioGenerationLimits/${userId}_${today}`);
    
    const rateLimitDoc = await rateLimitRef.get();
    const currentCount = rateLimitDoc.exists ? rateLimitDoc.data()?.count || 0 : 0;
    
    if (currentCount >= 5) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Daily bio generation limit reached. Please try again tomorrow.'
      );
    }
    
    // 3. Build prompt
    const { profile, feedback, regenerate } = data;
    const prompt = buildBioPrompt(profile, feedback, regenerate);
    
    // 4. Call OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a warm, empathetic writer creating authentic bios for moms on Raine, 
                      a connection app for mothers in the San Francisco Bay Area. Write in first person, 
                      conversational tone. Keep bios to 2-3 sentences. Be genuine, not salesy.`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.8
      });
      
      const bio = response.choices[0]?.message?.content?.trim() || '';
      
      // 5. Increment rate limit counter
      await rateLimitRef.set({
        count: currentCount + 1,
        lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      functions.logger.info('Bio generated successfully', {
        userId,
        bioLength: bio.length,
        regenerate: !!regenerate
      });
      
      return { bio };
      
    } catch (error) {
      functions.logger.error('OpenAI API error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate bio. Please try again.'
      );
    }
  });

function buildBioPrompt(
  profile: ProfileBioRequest['profile'],
  feedback?: string,
  regenerate?: boolean
): string {
  const childAges = profile.children.map(child => {
    const now = new Date();
    const birthDate = new Date(child.birthYear, child.birthMonth - 1);
    const ageMonths = (now.getFullYear() - birthDate.getFullYear()) * 12 + 
                      (now.getMonth() - birthDate.getMonth());
    
    if (ageMonths < 12) return `${ageMonths} months`;
    if (ageMonths < 24) return `${Math.floor(ageMonths / 12)} year`;
    return `${Math.floor(ageMonths / 12)} years`;
  }).join(', ');
  
  const cityFeelMap: Record<string, string> = {
    'rooted': 'feels at home here',
    'finding_footing': 'is still finding her footing',
    'local_but_missing': 'feels like a local but misses where she\'s from'
  };
  
  return `Create a bio for ${profile.firstName} from ${profile.city}, ${profile.state}.

About her:
- ${cityFeelMap[profile.cityFeel] || 'lives in the area'}
- Mom to ${profile.childCount} ${profile.childCount === 1 ? 'child' : 'children'} (ages: ${childAges})
- Before kids, she was into: ${profile.beforeMotherhood.join(', ')}
- Her perfect weekend involves: ${profile.perfectWeekend.join(', ')}
- To feel like herself, she needs: ${profile.feelYourself.replace('_', ' ')}
- Her aesthetic is: ${profile.aesthetic.join(' and ')}
- She's here because: ${profile.whatBroughtYou.replace(/_/g, ' ')}

${regenerate && feedback ? `\nThe previous version wasn't quite right. Feedback: "${feedback}". Generate a fresh, different bio.` : ''}

Write 2-3 sentences in first person.`;
}
```

### Secrets Setup

```bash
# Create OpenAI API key secret
gcloud secrets create openai-api-key --replication-policy="automatic"
echo -n "sk-your-openai-api-key" | gcloud secrets versions add openai-api-key --data-file=-

# Grant Cloud Functions access
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:YOUR_PROJECT@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 6. Photo Upload & Storage

### Frontend Feature
Screen 2 allows users to upload a profile photo from camera or gallery.

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Storage bucket | Firebase Cloud Storage | [Phase 9.1](./backend-implementation-plan.md#91-cloud-storage-setup) |
| Security rules | User can only write to own folder | [Phase 9.2](./backend-implementation-plan.md#92-storage-security-rules) |
| Max file size | 10MB limit | Security rules |
| Allowed formats | JPG, PNG, HEIC | Security rules |

### Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User profile photos
    match /users/{userId}/profile.jpg {
      // Anyone authenticated can read profile photos
      allow read: if request.auth != null;
      
      // Only owner can write their own photo
      allow write: if request.auth.uid == userId &&
        request.resource.size < 10 * 1024 * 1024 && // 10MB max
        request.resource.contentType.matches('image/(jpeg|png|heic|heif)');
    }
    
    // User profile photos - any filename
    match /users/{userId}/profile/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId &&
        request.resource.size < 10 * 1024 * 1024 &&
        request.resource.contentType.matches('image/(jpeg|png|heic|heif)');
    }
  }
}
```

### Storage Path Convention

```
/users/{userId}/profile.jpg    # Primary profile photo
/users/{userId}/profile/       # Additional photos (future)
```

---

## 7. Subscriptions

### Frontend Feature
Subscription paywall, premium features, subscription management

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| RevenueCat webhook | HTTP Cloud Function | [Phase 5.1](./backend-implementation-plan.md#51-revenuecat-webhook-setup) |
| Subscription status | `subscriptionStatus` in user doc | [Phase 5.2](./backend-implementation-plan.md#52-subscription-state-management) |
| Webhook security | Signature verification | [Phase 5.3](./backend-implementation-plan.md#53-webhook-security) |
| Status sync | Callable function | [Phase 5.2](./backend-implementation-plan.md#52-subscription-state-management) |

### Subscription Status Values

| Status | Description | Access Level |
|--------|-------------|--------------|
| `none` | Never subscribed | Free tier |
| `active` | Currently subscribed | Premium |
| `cancelled` | Cancelled but still in period | Premium until expiry |
| `expired` | Subscription ended | Free tier |
| `billing_issue` | Payment failed | Limited grace period |

### Frontend Integration

```typescript
// Frontend: Check subscription status
const user = await firestore().doc(`users/${uid}`).get();
const subscriptionStatus = user.data()?.subscriptionStatus || 'none';

const isPremium = ['active', 'cancelled'].includes(subscriptionStatus);

// Frontend: Force sync subscription status
const syncStatus = functions().httpsCallable('syncSubscriptionStatus');
await syncStatus();
```

---

## 8. Chat & Messaging

### Frontend Feature
Real-time chat between matched moms, typing indicators, read receipts

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Rooms collection | Firestore `rooms/{roomId}` | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Messages subcollection | `rooms/{roomId}/messages` | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Members subcollection | `rooms/{roomId}/members` | [Phase 3.1](./backend-implementation-plan.md#31-data-model-design) |
| Typing indicators | `roomPresence/{roomId}/typing` | [Phase 7.5](./backend-implementation-plan.md#75-read-receipts--typing-indicators) |
| Read receipts | `messages/{id}/readBy` | [Phase 7.5](./backend-implementation-plan.md#75-read-receipts--typing-indicators) |
| Message trigger | Update lastMessage, send notifications | [Phase 4.1](./backend-implementation-plan.md#41-message-created-trigger) |
| Push notifications | FCM multicast | [Phase 4.2](./backend-implementation-plan.md#42-push-notification-service) |
| Pagination | Cursor-based, 50 per page | [Phase 3.4](./backend-implementation-plan.md#34-pagination-strategy) |

### Real-time Listeners (Frontend)

```typescript
// Listen to messages in a room
const unsubscribe = firestore()
  .collection('rooms')
  .doc(roomId)
  .collection('messages')
  .where('deleted', '==', false)
  .orderBy('timestamp', 'desc')
  .limit(50)
  .onSnapshot(snapshot => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setMessages(messages);
  });

// Listen to typing indicators
const typingUnsubscribe = firestore()
  .collection('roomPresence')
  .doc(roomId)
  .collection('typing')
  .onSnapshot(snapshot => {
    const typingUsers = snapshot.docs
      .filter(doc => doc.id !== currentUserId)
      .map(doc => doc.id);
    setTypingUsers(typingUsers);
  });
```

---

## 9. Push Notifications

### Frontend Feature
New message notifications, subscription reminders, app announcements

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| FCM token storage | `users/{uid}/devices/{deviceId}` | [Phase 4.2](./backend-implementation-plan.md#42-push-notification-service) |
| Token refresh | `refreshFcmToken` callable | [Phase 4.2.1](./backend-implementation-plan.md#421-fcm-token-management) |
| Notification preferences | `notificationPreferences` in user doc | [Phase 4.3](./backend-implementation-plan.md#43-notification-preferences) |
| Quiet hours | Check before sending | [Phase 4.2](./backend-implementation-plan.md#42-push-notification-service) |
| Multi-device | Send to all user devices | [Phase 4.2](./backend-implementation-plan.md#42-push-notification-service) |
| Stale device cleanup | Scheduled function | [Phase 4.2.1](./backend-implementation-plan.md#421-fcm-token-management) |

### Frontend Integration

```typescript
// Register FCM token on app start
import messaging from '@react-native-firebase/messaging';
import { getUniqueId } from 'react-native-device-info';

async function registerForPushNotifications(userId: string) {
  const authStatus = await messaging().requestPermission();
  const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                  authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  
  if (enabled) {
    const token = await messaging().getToken();
    const deviceId = await getUniqueId();
    
    // Register with backend
    const refreshToken = functions().httpsCallable('refreshFcmToken');
    await refreshToken({
      deviceId,
      newToken: token,
      platform: Platform.OS,
      appVersion: '1.0.0'
    });
  }
}

// Handle token refresh
messaging().onTokenRefresh(async newToken => {
  const deviceId = await getUniqueId();
  const refreshToken = functions().httpsCallable('refreshFcmToken');
  await refreshToken({
    deviceId,
    newToken,
    platform: Platform.OS,
    appVersion: '1.0.0'
  });
});
```

---

## 10. Feature Flags

### Frontend Feature
Gradual feature rollouts, A/B testing, maintenance mode

### Backend Requirements

| Requirement | Backend Implementation | Reference |
|-------------|----------------------|-----------|
| Remote Config setup | Firebase Remote Config | [Phase 8.1](./backend-implementation-plan.md#81-remote-config-setup) |
| Feature flags | Boolean parameters | [Phase 8.1](./backend-implementation-plan.md#81-remote-config-setup) |
| Targeting | Platform, app version, random % | [Phase 8.2](./backend-implementation-plan.md#82-conditional-targeting) |

### Recommended Feature Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `maintenanceMode` | boolean | false | Show maintenance screen |
| `bioGenerationEnabled` | boolean | true | Enable AI bio generation |
| `chatEnabled` | boolean | true | Enable chat features |
| `maxChildrenCount` | number | 4 | Max children in profile |
| `waitlistEnabled` | boolean | true | Show waitlist for non-Bay Area |
| `subscriptionPaywallEnabled` | boolean | false | Require subscription for features |

### Frontend Integration

```typescript
import remoteConfig from '@react-native-firebase/remote-config';

// Initialize with defaults
await remoteConfig().setDefaults({
  maintenanceMode: false,
  bioGenerationEnabled: true,
  chatEnabled: true,
  maxChildrenCount: 4
});

// Fetch latest config
await remoteConfig().fetchAndActivate();

// Use values
const isMaintenanceMode = remoteConfig().getBoolean('maintenanceMode');
const maxChildren = remoteConfig().getNumber('maxChildrenCount');
```

---

## 11. Implementation Priority Matrix

### Priority 1: Critical for Launch (Profile Setup)

| Feature | Backend Task | Status |
|---------|-------------|--------|
| User document creation | Auth onCreate trigger | ☐ |
| Profile data storage | Firestore schema + rules | ☐ |
| Photo upload | Storage bucket + rules | ☐ |
| AI bio generation | Cloud Function + OpenAI | ☐ |
| Waitlist collection | Firestore schema + rules | ☐ |

### Priority 2: Core Features (Post-Profile)

| Feature | Backend Task | Status |
|---------|-------------|--------|
| Push notifications | FCM setup + triggers | ☐ |
| Subscription webhook | RevenueCat integration | ☐ |
| Feature flags | Remote Config setup | ☐ |

### Priority 3: Engagement Features

| Feature | Backend Task | Status |
|---------|-------------|--------|
| Chat/messaging | Rooms + messages collections | ☐ |
| Typing indicators | Presence collection | ☐ |
| Read receipts | ReadBy subcollection | ☐ |

### Priority 4: Optimization

| Feature | Backend Task | Status |
|---------|-------------|--------|
| Rate limiting | Rate limit service | ☐ |
| Analytics export | BigQuery setup | ☐ |
| Backup/recovery | PITR + exports | ☐ |

---

## Quick Reference: API Endpoints

### Callable Functions

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `generateProfileBio` | AI bio generation | Yes |
| `refreshFcmToken` | Update push token | Yes |
| `syncSubscriptionStatus` | Force subscription sync | Yes |
| `updateUserProfile` | Validated profile update | Yes |
| `setTypingStatus` | Update typing indicator | Yes |
| `markMessagesRead` | Mark messages as read | Yes |
| `deleteMessage` | Soft delete message | Yes |
| `reportUser` | Report another user | Yes |

### HTTP Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `POST /revenuecatWebhook` | Subscription events | Webhook token |
| `GET /healthCheck` | System health | None |

### Firestore Triggers

| Trigger | Collection | Purpose |
|---------|------------|---------|
| `onUserCreate` | `users` | Initialize user document |
| `onUserDelete` | `users` | GDPR cleanup |
| `onMessageCreated` | `rooms/*/messages` | Notifications + lastMessage |

---

## Environment Variables & Secrets

| Secret | Purpose | Where Used |
|--------|---------|------------|
| `OPENAI_API_KEY` | Bio generation | `generateProfileBio` |
| `REVENUECAT_WEBHOOK_TOKEN` | Webhook auth | `revenuecatWebhook` |
| `REVENUECAT_API_KEY` | API calls | `syncSubscriptionStatus` |

---

## Notes for Frontend Team

1. **Offline Support**: All Firestore operations support offline-first. Enable persistence:
   ```typescript
   firestore().settings({ persistence: true });
   ```

2. **Loading States**: AI bio generation may take 2-5 seconds. Show loading indicator.

3. **Error Handling**: All callable functions return structured errors:
   ```typescript
   try {
     await generateBio({ profile });
   } catch (error) {
     if (error.code === 'resource-exhausted') {
       // Rate limited
     }
   }
   ```

4. **Real-time Updates**: Use `onSnapshot` listeners for chat, not polling.

5. **Token Refresh**: Always call `refreshFcmToken` on app launch and when token changes.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-03 | Initial document creation | — |
