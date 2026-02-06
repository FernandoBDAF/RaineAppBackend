# Backend Authentication Implementation Plan

> **Status:** Not Started - All phases pending

**Project:** Raine-bk  
**Scope:** Firebase Auth configuration + LinkedIn Cloud Functions  
**Reference:** `systemic_view/2-AUTHENTICATION-IMPLEMENTATION-STUDY.md`  
**Deferred Tasks:** See `development/0-backlog.md` → Tasks 7, 8, 9

---

## Overview

The backend authentication work is minimal - Firebase Auth handles social login natively. The backend's role is:

1. **Firebase Console configuration** (human task)
2. **LinkedIn OAuth Cloud Functions** (LLM task - Firebase doesn't support LinkedIn natively)
3. **User type updates** (LLM task - add auth provider tracking)
4. **Verify existing triggers** (LLM task - ensure onUserCreate handles social profile data)

---

## Current State

### Already Deployed
- `onUserCreate` trigger - creates user profile on signup ✅
- `onUserDelete` trigger - GDPR cleanup on deletion ✅
- Firestore security rules - user profile protection ✅
- User TypeScript types ✅

### Gaps
- `onUserCreate` doesn't store auth provider type
- `onUserCreate` doesn't handle social profile photo URL properly
- No LinkedIn OAuth functions (LinkedIn isn't a native Firebase provider)
- No LinkedIn secrets configured
- Firebase Console: Social providers not enabled

---

## Phase 1: Firebase Console Configuration

**Owner:** Human  
**Duration:** ~1 hour

### Task 1.1: Enable Facebook Provider

1. Go to Firebase Console → Authentication → Sign-in method
2. Click **Add new provider** → **Facebook**
3. Toggle **Enable**
4. Copy the **OAuth redirect URI** (save for Facebook App setup)
5. Leave App ID/Secret blank for now (will fill after creating Facebook App)
6. Click **Save**

### Task 1.2: Enable Apple Provider

1. In Firebase Console → Authentication → Sign-in method
2. Click **Add new provider** → **Apple**
3. Toggle **Enable**
4. For native iOS apps, no Service ID / Team ID needed
5. Click **Save**

### Task 1.3: Verify Email/Password Provider

1. In Firebase Console → Authentication → Sign-in method
2. Confirm **Email/Password** is enabled (for development/testing only)

### Checklist After Phase 1
- [ ] Facebook provider enabled in Firebase Auth
- [ ] Apple provider enabled in Firebase Auth
- [ ] Email/Password enabled (dev/test only)
- [ ] OAuth redirect URI saved for Facebook App setup

---

## Phase 2: Update User Types & Trigger

**Owner:** LLM  
**Duration:** ~30 minutes

### Task 2.1: Update User Type

**File:** `functions/src/types/index.ts`

**Changes:**
- Add `authProvider` field to track how the user signed up
- Add `providerId` field to store the social provider UID

```typescript
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  authProvider: AuthProvider;        // NEW
  providerUid?: string;             // NEW - social provider user ID
  subscriptionStatus: SubscriptionStatus;
  // ... rest unchanged
}

export type AuthProvider =
  | "email"
  | "facebook.com"
  | "apple.com"
  | "linkedin"
  | "unknown";
```

### Task 2.2: Update onUserCreate Trigger

**File:** `functions/src/triggers/auth/onUserCreate.ts`

**Changes:**
- Extract auth provider from `user.providerData`
- Store provider-specific profile photo
- Handle Apple's relay email properly
- Store provider UID for deduplication

**Key Logic:**
```typescript
const providerData = user.providerData?.[0];
const authProvider = providerData?.providerId || "unknown";
const providerUid = providerData?.uid || "";

const userProfile: User = {
  uid: userId,
  email: user.email || "",
  displayName: user.displayName || "",
  photoURL: providerData?.photoURL || user.photoURL || "",
  authProvider: authProvider as AuthProvider,
  providerUid: providerUid,
  subscriptionStatus: "free",
  // ...
};
```

---

## Phase 3: LinkedIn Cloud Functions

**Owner:** LLM  
**Duration:** ~1 hour

LinkedIn is NOT a built-in Firebase Auth provider, so we need backend functions to handle the OAuth flow.

### Task 3.1: Create LinkedIn Auth Function

**File:** `functions/src/callable/linkedInAuth.ts`

**Function to create:**

#### `linkedInExchangeCode`
- **Type:** HTTPS Request (`onRequest`) - NOT `onCall`
- **Why `onRequest`:** The user is NOT authenticated when calling this function. `onCall` would require a Firebase Auth token which doesn't exist yet during the OAuth flow. Using `onRequest` allows unauthenticated access with custom security.
- **Method:** POST only
- **Input (body):** `{ code: string, redirectUri: string }`
- **Output (JSON):** `{ success: boolean, customToken?: string, error?: string }`
- **Flow:**
  1. Validate request method (POST only) and input parameters
  2. Exchange auth code for LinkedIn access token (POST to LinkedIn token endpoint)
  3. Fetch LinkedIn user profile (GET /v2/userinfo - OpenID Connect)
  4. Extract: email, name, picture, LinkedIn `sub`
  5. Create or update Firebase Auth user with UID `linkedin:{sub}`
  6. Set `displayName` and `email` on the Firebase Auth user (important: custom token users don't have these automatically)
  7. Generate Firebase custom token via `admin.auth().createCustomToken(uid)`
  8. Return custom token to frontend

**Security:**
- Validate `code` parameter is non-empty string
- LinkedIn Client ID and Client Secret stored in Google Secret Manager (`defineSecret`)
- Rate limit: 10 requests per minute per IP (implement in function)
- Validate `redirectUri` matches expected value (prevent redirect attacks)
- CORS: Allow only `com.raine.app` origins

**Critical Note on `displayName`:**  
When using custom tokens, the Firebase Auth `user` object passed to `onUserCreate` will NOT have `displayName` or `photoURL`. The LinkedIn function must call `admin.auth().updateUser(uid, { displayName, photoURL })` BEFORE the custom token is used by the client, so that `onUserCreate` can access them from `user.providerData`.

### Task 3.2: Export Functions

**File:** `functions/src/index.ts`

Add export:
```typescript
export {linkedInExchangeCode} from "./callable/linkedInAuth";
```

### Task 3.3: Configure LinkedIn Secrets

**Owner:** Human

```bash
firebase functions:secrets:set LINKEDIN_CLIENT_ID
firebase functions:secrets:set LINKEDIN_CLIENT_SECRET
```

### Task 3.4: Deploy

**Owner:** Human

```bash
firebase deploy --only functions:linkedInExchangeCode
```

---

## Phase 4: Integration Alignment

**Owner:** LLM  
**Duration:** ~30 minutes

### Task 4.0: Align subscriptionStatus Enum

**File:** `functions/src/triggers/auth/onUserCreate.ts`

**Issue:** Backend uses `"free"` for new users, frontend may expect `"none"`. The integration analyses flagged this as a high-priority mismatch.

**Action:** Confirm with frontend which value to use and ensure consistency. If frontend uses `"free"`, no change needed. If frontend uses `"none"`, update the backend enum.

**Check:** `functions/src/types/index.ts` - `SubscriptionStatus` type

---

## Phase 5: Security Hardening

**Owner:** LLM  
**Duration:** ~30 minutes

### Task 5.1: Update Firestore Rules

**File:** `firestore/firestore.rules`

**Changes:**
- Ensure `authProvider` and `providerUid` are read-only (only Cloud Functions can set them)
- Add to the list of protected fields in user update rule:

```
allow update: if isOwner(userId) 
  && !request.resource.data.diff(resource.data).affectedKeys()
      .hasAny(['subscriptionStatus', ..., 'authProvider', 'providerUid']);
```

### Task 5.2: Add Account Linking Protection

Add a Cloud Function to prevent duplicate accounts from the same social provider:

**File:** `functions/src/triggers/auth/onUserCreate.ts`

**Logic:**
```typescript
// Check if a user with this provider UID already exists
if (providerUid) {
  const existingUsers = await db.collection("users")
    .where("providerUid", "==", providerUid)
    .where("authProvider", "==", authProvider)
    .limit(1)
    .get();
  
  if (!existingUsers.empty) {
    logger.warn("Duplicate provider account detected", {
      userId, authProvider, providerUid
    });
  }
}
```

---

## Phase 6: Testing & Verification

**Owner:** Human + LLM  
**Duration:** ~1 hour

### Task 6.1: Emulator Testing

```bash
cd /path/to/Raine/Raine-bk
firebase emulators:start
```

Test scenarios:
1. Create user in Auth emulator → verify Firestore profile created with provider info
2. Delete user in Auth emulator → verify cleanup runs
3. Call `linkedInExchangeCode` with mock data → verify custom token returned

### Task 6.2: Production Verification

After deploying:
1. Check Cloud Functions logs for successful trigger execution
2. Verify new user documents have `authProvider` field
3. Test LinkedIn endpoint responds (should return error without valid code)

### Checklist After Phase 6
- [ ] `onUserCreate` stores auth provider type
- [ ] `onUserCreate` stores provider-specific photo URL
- [ ] `onUserCreate` handles LinkedIn custom token users (displayName from Auth record)
- [ ] `linkedInExchangeCode` function deployed (as `onRequest`, not `onCall`)
- [ ] LinkedIn secrets configured (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET)
- [ ] Firestore rules updated to protect `authProvider`, `providerUid` fields
- [ ] `subscriptionStatus` enum aligned with frontend
- [ ] All 10 Cloud Functions verified in `firebase functions:list`

---

## Deployment Summary

### Files Modified (LLM)
| File | Changes |
|------|---------|
| `functions/src/types/index.ts` | Add `AuthProvider` type, update `User` interface |
| `functions/src/triggers/auth/onUserCreate.ts` | Extract provider data, store auth provider |
| `functions/src/callable/linkedInAuth.ts` | **NEW** - LinkedIn OAuth functions |
| `functions/src/index.ts` | Export LinkedIn functions |
| `firestore/firestore.rules` | Protect authProvider/providerUid fields |

### Human Tasks
| Task | When |
|------|------|
| Enable Facebook provider in Firebase Console | Phase 1 |
| Enable Apple provider in Firebase Console | Phase 1 |
| Create Facebook App in Meta Developer Console | Before frontend work |
| Create LinkedIn App in LinkedIn Developer Portal | Before Phase 3 |
| Set LinkedIn secrets via CLI | Phase 3 |
| Deploy functions | After LLM code complete |
| Test end-to-end | Phase 5 |

### Dependencies
- **Blocked by:** Facebook App ID/Secret (needed for Firebase Console Facebook config)
- **Blocked by:** LinkedIn Client ID/Secret (needed for Cloud Function secrets)
- **No blockers for:** Apple Sign In, user type updates, Firestore rules

---

## Execution Order

```
Phase 1 (Human)  → Enable providers in Firebase Console
Phase 2 (LLM)   → Update types + onUserCreate trigger
Phase 3 (LLM)   → Create LinkedIn Cloud Function (onRequest, not onCall)
Phase 3 (Human)  → Configure LinkedIn secrets + deploy
Phase 4 (LLM)   → Align subscriptionStatus enum with frontend
Phase 5 (LLM)   → Security hardening (rules + dedup)
Phase 6 (Both)   → Test and verify
```

**Total Backend Effort:** ~4-5 hours

---

## Known Cross-Project Dependencies

These items were identified in the integration analyses and must be coordinated:

| Issue | Backend Action | Frontend Action | Reference |
|-------|---------------|-----------------|-----------|
| Functions region `us-west2` | Already deployed | Must call `functions().region('us-west2')` | integration-from-backend §4.1 |
| `subscriptionStatus` enum | Confirm `"free"` vs `"none"` | Match backend value | integration-from-frontend §4.1 |
| LinkedIn `displayName` | Set via `admin.auth().updateUser()` before returning token | N/A (handled by backend) | This plan Phase 3 |
| LinkedIn function type | `onRequest` (HTTP POST) | Call via `fetch()`, not `httpsCallable()` | This plan Phase 3 |
| Apple `displayName` | Accept from `onUserCreate` trigger | Set via `userCredential.user.updateProfile()` | frontend auth plan Phase 4 |
