# Backend Backlog

## Pending Tasks

### 1. Configure RevenueCat Webhook
**Priority:** Medium  
**Dependencies:** Backend deployed (✅ Done)

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
**Dependencies:** RaineApp rebuilt with Firebase config, RevenueCat configured

**Test Scenarios:**
1. **User Registration Flow**
   - Create new user via social login
   - Verify `onUserCreate` trigger fires
   - Verify user document created in Firestore

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

## Completed Tasks

- [x] Firebase project setup (raineapp-backend)
- [x] Cloud Functions deployment (9 functions)
- [x] Firestore security rules
- [x] Storage security rules
- [x] Firestore indexes
- [x] IAM permissions configuration
