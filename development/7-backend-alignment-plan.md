# Backend Alignment Plan — Remove Legacy Code, Align with Frontend

## Full cleanup of rooms, legacy connections, and stale types

> **Status:** ✅ IMPLEMENTED (March 2026)  
> **Build:** Passing  
> **Remaining Manual Step:** Delete Firestore collections (see Task 12 below)

**Date:** March 2026  
**Context:** The frontend (RaineApp) completed Phases 1–3 of the connections refactor. All legacy code has been removed. The backend still contains dual-model support (rooms + connections), legacy types, and stale triggers. Since we are wiping all Firestore collections and starting fresh, there is no need to maintain backward compatibility.  
**Goal:** Align `Raine-bk` with the current state of `RaineApp` so all three projects (RaineApp, Raine-bk, Raine-backoffice) operate on the same data model.

---

## 1. Current State

### What the frontend expects (post-Phase 3)

| Collection | Schema | Service |
|---|---|---|
| `introductions/{introId}` | `users[]`, `userUids[]`, `matchDetails`, `status`, `connectionId`, `expiresAt` | `introductions-service.ts` |
| `connections/{connectionId}` | `fromUser`, `toUser`, `memberUids`, `status`, `lastMessage`, `introductionId` | `connections-service.ts` |
| `connections/{connectionId}/messages/{msgId}` | `senderId`, `text`, `timestamp`, `reactions`, `deleted`, `deletedAt`, `editedAt` | `messages-service.ts` |

### What the backend still has (legacy)

| Item | Location | Status |
|---|---|---|
| `Room`, `RoomMember`, `RoomMembership`, `LastMessage` types | `types/index.ts` lines 146–171 | Dead code |
| Legacy `Connection` type (per-user `{userId, createdAt}`) | `types/index.ts` lines 49–53 | Dead code |
| `onMessageCreated` trigger (rooms path) | `triggers/firestore/onMessageCreated.ts` | Dead code |
| `sendPushNotifications()` (room-based) | `services/notifications.ts` lines 14–118 | Dead code |
| `setTypingStatus` callable (uses `rooms/{id}/members`, `rooms/{id}/typing`) | `callable/setTypingStatus.ts` | Dead — needs rewrite for connections |
| `markMessagesRead` callable (uses `rooms/{id}/members`, `rooms/{id}/messages/readBy`) | `callable/markMessagesRead.ts` | Dead — needs rewrite for connections |
| `onUserDelete` — deletes `connections/${userId}` (old per-user doc) | `triggers/auth/onUserDelete.ts` line 30 | Wrong path |
| `onUserDelete` — iterates `rooms` collection, cleans `roomMemberships` | `triggers/auth/onUserDelete.ts` lines 45–78 | Dead code |
| `cleanupDevices` — iterates `rooms` for typing cleanup | `scheduled/cleanupDevices.ts` lines 60–73 | Dead code |
| `processRetryQueue` — `retry.roomId` fallback | `scheduled/processRetryQueue.ts` lines 56–57 | Dead path |
| `room_create` rate limit | `services/rateLimit.ts` line 8 | Dead code |
| `NotificationRetry.roomId` field | `types/index.ts` line 244 | Dead field |
| `UserReport.roomId` field | `types/index.ts` line 289 | Should be `connectionId` |
| Firestore rules: `rooms` collection | `firestore.rules` lines 72–144 | Dead code |
| Firestore rules: legacy `connections` fallbacks (`resource.data.userId`) | `firestore.rules` lines 226–239 | Dead paths |
| `ConnectionDocument` naming (vs frontend's `Connection`) | `types/index.ts` line 71 | Naming mismatch |

---

## 2. Tasks

### Task 1: Clean Up Types (`types/index.ts`)

**Remove entirely:**
- `Connection` interface (legacy per-user, lines 49–53)
- `Room` interface (lines 146–153)
- `LastMessage` interface (lines 155–159) — the connection version is `ConnectionLastMessage`
- `RoomMember` interface (lines 161–165)
- `RoomMembership` interface (lines 167–171)
- `ReadReceipt` interface (line 190) — no longer used with rooms gone
- `TypingIndicator` interface (lines 198–201) — will be rewritten for connections

**Rename:**
- `ConnectionDocument` → `Connection` (now that the legacy `Connection` is removed, the name is free; aligns with frontend)

**Update:**
- `NotificationRetry`: remove `roomId` field, keep only `connectionId` (make it required)
- `UserReport`: replace `roomId?: string` with `connectionId?: string`

**Add:**
- `MessagePayload` type (matches frontend's `types/message.ts`)

### Task 2: Remove Room-Based Trigger (`onMessageCreated.ts`)

- Delete `triggers/firestore/onMessageCreated.ts` entirely
- Remove its export from `index.ts`

### Task 3: Remove Room-Based Notification Function

- Delete `sendPushNotifications()` from `services/notifications.ts` (lines 14–118, the room-based function)
- Keep `sendPushNotificationsForConnection()` (the connection-based function)
- Keep `handleFailedTokens()`, `sendUserNotification()`, `notifyUserBillingIssue()`, `notifyUserSubscriptionExpired()`

### Task 4: Rewrite `setTypingStatus` for Connections

Current: operates on `rooms/{roomId}/members` and `rooms/{roomId}/typing`.

Rewrite to operate on `connections/{connectionId}`:
- Accept `connectionId` instead of `roomId`
- Verify caller is in `connections/{connectionId}.memberUids`
- Write typing indicator to `connections/{connectionId}/typing/{userId}` (new subcollection on connection)
- Update the rate limit key from `room_create` to keep only `typing_status`

### Task 5: Rewrite `markMessagesRead` for Connections

Current: operates on `rooms/{roomId}/members` and `rooms/{roomId}/messages/{id}/readBy`.

Rewrite to operate on connections:
- Accept `connectionId` instead of `roomId`
- Verify caller is in `connections/{connectionId}.memberUids`
- Write read receipt to `connections/{connectionId}/messages/{messageId}/readBy/{userId}`
- Remove the `users/{userId}/roomMemberships/{roomId}` update (no room memberships subcollection)

### Task 6: Rewrite `onUserDelete` for Connections

Current cleanup steps that need changing:

| Step | Current | New |
|---|---|---|
| 2 | Delete `connections/${userId}` (old per-user doc) | Query `connections` where `memberUids array-contains userId`, update each to `status: 'canceled'`, remove user data from `fromUser`/`toUser` |
| 4 | Delete `users/${userId}/roomMemberships` | Remove — subcollection no longer exists |
| 5 | Iterate all `rooms`, remove member, decrement count | Remove — no rooms collection |

Keep steps 1 (delete user profile), 3 (delete devices), 6 (delete notifications), 7 (delete reports), 8 (clean rate limits).

### Task 7: Update `cleanupDevices` Scheduled Function

- Remove the rooms typing cleanup (lines 60–73) — typing indicators now live under connections
- Replace with: iterate `connections` collection, clean stale typing indicators from `connections/{id}/typing`

### Task 8: Update `processRetryQueue`

- Remove the `retry.roomId` fallback path (lines 56–57)
- Only use `retry.connectionId` for notification retries
- Remove the `sendPushNotifications` import (room-based function deleted in Task 3)

### Task 9: Update Rate Limits

- Remove `room_create` from `RATE_LIMITS` in `services/rateLimit.ts`
- The remaining rate limits (`message_send`, `report_user`, `typing_status`) are still valid

### Task 10: Update Firestore Security Rules

**Remove:**
- Entire `rooms` collection rules (lines 72–144)
- `users/{userId}/roomMemberships` rules (lines 62–65)
- Legacy `connections` fallbacks: remove `|| resource.data.userId == request.auth.uid` from connections read/create/update rules
- `isRoomMember()` and `isRoomAdmin()` helper functions (lines 21–29)

**Add:**
- `connections/{connectionId}/typing/{userId}` subcollection rules (read/write for connection members)

**Keep as-is:**
- `introductions` rules (already correct)
- `connections` rules (just remove legacy fallbacks)
- `connections/messages` rules (already correct)
- All system collection deny rules

### Task 11: Add `role` Field to User Type (for Backoffice Auth)

Add a `role` field to the `User` type to support backoffice authentication:

```typescript
export interface User {
  // ... existing fields
  role?: 'admin' | 'user';  // Custom claim for backoffice access; undefined = 'user'
}
```

This field is set via Firebase custom claims (`admin.auth().setCustomUserClaims(uid, { role: 'admin' })`), not stored in Firestore. The type annotation documents the claim structure for the backoffice middleware.

Add the `role` field to the protected fields list in Firestore rules (users cannot self-assign admin):

```javascript
allow update: if isOwner(userId) 
  && !request.resource.data.diff(resource.data).affectedKeys()
      .hasAny([/* existing protected fields */, 'role']);
```

### Task 12: Delete Firestore Collections (Manual)

Since we are starting fresh, delete all documents from:
- `rooms` (and all subcollections)
- `connections` (old per-user docs if any exist)
- `introductions` (will be re-seeded via backoffice)
- `notificationRetryQueue`
- `deadLetterQueue`
- `processedEvents`

**Steps to delete via Firebase Console:**

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → Firestore Database
2. For each collection listed above:
   - Click on the collection name
   - Click the three-dot menu (⋮) next to the collection name
   - Select "Delete collection"
   - Confirm by typing the collection name
3. Verify all collections are empty

**Alternative: Delete via Firebase CLI**

```bash
# Install firebase-tools if not already installed
npm install -g firebase-tools

# Delete each collection (requires project ID)
firebase firestore:delete --project raineapp-backend -r rooms
firebase firestore:delete --project raineapp-backend -r connections
firebase firestore:delete --project raineapp-backend -r introductions
firebase firestore:delete --project raineapp-backend -r notificationRetryQueue
firebase firestore:delete --project raineapp-backend -r deadLetterQueue
firebase firestore:delete --project raineapp-backend -r processedEvents
```

> **Note:** Do this AFTER deploying all code changes.

---

## 3. Dependency Order

```
Task 1 (types)
  └── Task 2 (remove onMessageCreated)
  └── Task 3 (remove room notifications)
  └── Task 8 (update retry queue)
  └── Task 9 (update rate limits)

Task 1 → Task 4 (rewrite setTypingStatus)
Task 1 → Task 5 (rewrite markMessagesRead)
Task 1 → Task 6 (rewrite onUserDelete)
Task 1 → Task 7 (update cleanupDevices)

Task 10 (security rules) — independent, can be done anytime
Task 11 (role field) — independent
Task 12 (delete collections) — do LAST, after deploying all code changes
```

Tasks 2, 3, 8, 9 can be done together (simple deletions).
Tasks 4, 5 are independent rewrites.
Task 6 is the most complex rewrite.

---

## 4. Files Changed

### Delete (2 files)

| File | Reason |
|---|---|
| `triggers/firestore/onMessageCreated.ts` | Rooms trigger replaced by `onConnectionMessageCreated.ts` |
| *(no other full deletions)* | |

### Modify (10 files)

| File | Changes |
|---|---|
| `types/index.ts` | Remove Room/legacy types, rename `ConnectionDocument` → `Connection`, update `NotificationRetry`, `UserReport` |
| `index.ts` | Remove `onMessageCreated` export |
| `services/notifications.ts` | Remove `sendPushNotifications()` (room-based) |
| `services/rateLimit.ts` | Remove `room_create` rate limit |
| `callable/setTypingStatus.ts` | Rewrite for connections |
| `callable/markMessagesRead.ts` | Rewrite for connections |
| `triggers/auth/onUserDelete.ts` | Rewrite cleanup for connections (remove rooms logic) |
| `scheduled/cleanupDevices.ts` | Replace rooms typing cleanup with connections typing cleanup |
| `scheduled/processRetryQueue.ts` | Remove room fallback path |
| `firestore.rules` | Remove rooms, legacy fallbacks; add typing subcollection rules |

---

## 5. Effort Estimate

| Task | Effort |
|---|---|
| Task 1: Clean up types | 30 min |
| Task 2: Remove onMessageCreated | 10 min |
| Task 3: Remove room notifications | 15 min |
| Task 4: Rewrite setTypingStatus | 45 min |
| Task 5: Rewrite markMessagesRead | 45 min |
| Task 6: Rewrite onUserDelete | 1h |
| Task 7: Update cleanupDevices | 30 min |
| Task 8: Update processRetryQueue | 15 min |
| Task 9: Update rate limits | 10 min |
| Task 10: Update security rules | 30 min |
| Task 11: Add role field | 15 min |
| Task 12: Delete collections (manual) | 15 min |
| **Total** | **~5h** |

---

## 6. Verification

**Code changes verified:**

- [x] `npm run build` passes with no TypeScript errors
- [x] `npm run lint` passes with no errors
- [ ] Firebase emulator loads all functions successfully (to be tested)
- [x] No references to `room`, `Room`, `roomId`, or `roomMemberships` remain in `functions/src/`

**Deployment steps:**

```bash
cd Raine-bk

# Deploy functions and rules
firebase deploy --only functions,firestore:rules

# Verify deployment
firebase functions:list
```

**Post-deployment:**

1. Manually delete old Firestore collections (Task 12)
2. Verify in Firebase Console that the `rooms` collection is empty / deleted
