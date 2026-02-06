# Backend Backlog

---

## Pending Tasks

### 1. Configure RevenueCat Webhook
**Priority:** Medium  
**Status:** Not Started  
**Dependencies:** Backend deployed (✅ Done)  
**Owner:** Human

**Steps:**
1. Log in to RevenueCat Dashboard
2. Navigate to Project Settings → Webhooks
3. Add new webhook:
   - **URL:** `https://us-west2-raineapp-backend.cloudfunctions.net/revenuecatWebhook`
   - **Authorization Header:** `Bearer JvHD1k9Xlh6lawmes2uPoD+31Gy/BVspFKH92O9WQus=`
4. Select events to subscribe to:
   - INITIAL_PURCHASE
   - RENEWAL
   - CANCELLATION
   - EXPIRATION
   - BILLING_ISSUE
   - PRODUCT_CHANGE
5. Send test webhook to verify

---

### 2. End-to-End Testing
**Priority:** High  
**Status:** Not Started  
**Dependencies:** RaineApp rebuilt with Firebase config, Authentication implemented  
**Owner:** Human + LLM

**Test Scenarios:**
1. **User Registration Flow**
   - Create new user via social login
   - Verify `onUserCreate` trigger fires
   - Verify user document created in Firestore with auth provider info

2. **Messaging Flow**
   - Create a room
   - Send a message
   - Verify `onMessageCreated` trigger fires
   - Verify push notifications delivered

3. **Subscription Flow**
   - Complete test purchase in app
   - Verify RevenueCat webhook received
   - Verify user subscription status updated

4. **User Deletion Flow (GDPR)**
   - Delete user account
   - Verify `onUserDelete` trigger fires
   - Verify all user data cleaned up

---

### 3. Set Up Monitoring & Alerting
**Priority:** Low  
**Status:** Not Started  
**Dependencies:** Backend deployed (✅ Done)  
**Owner:** Human

**Steps:**
1. Go to Google Cloud Console → Monitoring
2. Create alerts for:
   - Function error rate > 1%
   - Function execution time > 10s
   - Firestore read/write quota warnings
3. Configure notification channels (email, Slack, etc.)

---

### 4. Upgrade Node.js Runtime
**Priority:** Low  
**Status:** Not Started  
**Dependencies:** None  
**Owner:** LLM + Human

**Context:** Firebase warned during deployment:
> "Runtime Node.js 20 will be deprecated on 2026-04-30 and will be decommissioned on 2026-10-30"

**Steps:**
1. Update `functions/package.json` → `"engines": { "node": "22" }`
2. Test with emulators
3. Redeploy

---

### 5. CI/CD Pipeline
**Priority:** Low  
**Status:** Not Started  
**Dependencies:** Git repo initialized  
**Owner:** Human + LLM

**Steps:**
1. Initialize Git repository for `Raine-bk/`
2. Set up GitHub Actions for:
   - Lint + build on PR
   - Deploy to Firebase on merge to main
3. Configure deployment environments (dev, staging, production)

---

### 6. Clean Up Extra Firestore Database
**Priority:** Low  
**Status:** Not Started  
**Dependencies:** None  
**Owner:** Human

**Context:** During setup, a database named `raineapp-default` was accidentally created alongside the correct `(default)` database. The `raineapp-default` database is unused and can be deleted.

**Steps:**
1. Go to Firebase Console → Firestore
2. Select `raineapp-default` database
3. Delete it (only `(default)` is used by the app)

---

## Deferred from Authentication Plan

### 7. Authentication: Enable Social Providers in Firebase Console
**Priority:** High  
**Status:** Not Started (Phase 1 of auth plan)  
**Dependencies:** Facebook App created by human  
**Owner:** Human  
**Plan Reference:** `development/4-authentication-implementation-plan.md` → Phase 1

**Steps:**
1. Enable Facebook provider in Firebase Auth (needs Facebook App ID + Secret)
2. Enable Apple provider in Firebase Auth
3. Verify Email/Password is enabled for dev/testing

---

### 8. Authentication: Create LinkedIn Cloud Function
**Priority:** Medium  
**Status:** Not Started (Phase 3 of auth plan)  
**Dependencies:** LinkedIn App created, LinkedIn secrets set  
**Owner:** LLM + Human  
**Plan Reference:** `development/4-authentication-implementation-plan.md` → Phase 3

**Steps (LLM):**
1. Create `functions/src/callable/linkedInAuth.ts` with `linkedInExchangeCode`
2. Export from `functions/src/index.ts`

**Steps (Human):**
3. Create LinkedIn App at developer.linkedin.com
4. `firebase functions:secrets:set LINKEDIN_CLIENT_ID`
5. `firebase functions:secrets:set LINKEDIN_CLIENT_SECRET`
6. `firebase deploy --only functions:linkedInExchangeCode`

---

### 9. Authentication: Update User Types & onUserCreate Trigger
**Priority:** High  
**Status:** Not Started (Phase 2 of auth plan)  
**Dependencies:** None  
**Owner:** LLM  
**Plan Reference:** `development/4-authentication-implementation-plan.md` → Phase 2

**Steps:**
1. Add `AuthProvider` type and `authProvider`/`providerUid` fields to User interface
2. Update `onUserCreate` to extract and store provider data
3. Update Firestore rules to protect new fields
4. Deploy

---

## Completed Tasks

- [x] Firebase project setup (raineapp-backend) - Project ID: 358132660024
- [x] Blaze plan upgrade
- [x] Cloud Functions deployment (9 functions, all in us-west2)
- [x] Firestore security rules deployed
- [x] Storage security rules deployed
- [x] Firestore composite indexes deployed
- [x] IAM permissions configured (Compute service account: Storage, Artifact Registry, Logs Writer, Cloud Functions Developer, Service Account User)
- [x] App Engine initialized (us-west2)
- [x] Google Secret Manager configured (REVENUECAT_WEBHOOK_SECRET)
- [x] Firestore database "(default)" created (Native mode, us-west2)
- [x] Firebase emulator testing passed (all 9 functions loaded)
- [x] Webhook security verified (401 for invalid tokens, 200 for valid)
- [x] ESLint configuration fixed (max-len 120, JSDoc disabled)
- [x] React Native Firebase Expo plugins configured (app.json)
- [x] EAS build initiated for iOS simulator
