# Backend Upgrade Implementation Plan
## From Chat MVP to Full Social Platform

**Date:** February 6, 2026  
**Current State:** 9 Cloud Functions deployed (chat-centric MVP)  
**Target State:** 43 Cloud Functions (full social platform)  
**Region:** us-west2 | **Project:** raineapp-backend

**Source Documents:**
- `systemic_view/4-infra-and-data.md` — Unified data model contract
- `systemic_view/4-completing-the-vision.md` — Screen & flow architecture
- `RaineApp/documents/MASTER-IMPLEMENTATION-PLAN.md` — Frontend phasing
- `RaineApp/documents/3-INTRODUCTIONS-PRD.md` — Introductions feature spec
- `RaineApp/documents/3-COMMUNITIES-PRD.md` — Communities feature spec
- `RaineApp/documents/3-DROPS-PRD.md` — Drops feature spec

---

## 1. Gap Analysis: Current → Target

### 1.1 Type Definitions

**Current** (`functions/src/types/index.ts`): 12 interfaces covering User, Room, Message, Device, Notification, Webhooks, Rate Limiting, Idempotency.

**Missing:**

| Type | For Feature | Priority |
|------|------------|----------|
| Profile setup fields on `User` (23 fields) | All features | P0 |
| `AuthProvider` enum | Auth | P0 |
| `Introduction`, `IntroductionStatus` | Introductions | P1 |
| `SavedConnection`, `MatchedProfile` | Introductions | P1 |
| `ActivityCounts` | Home | P1 |
| `Community`, `CommunityCategory`, `CommunityJoinType` | Communities | P2 |
| `CommunityMember`, `CommunityJoinRequest` | Communities | P2 |
| `CommunityPost`, `PostReply`, `PostLike` | Communities | P2 |
| `CommunityActivityItem`, `ActivityType` | Communities | P2 |
| `UserCommunityMembership`, `UserQuestion`, `SavedPost` | Communities | P2 |
| `Drop`, `DropCategory`, `DropSection`, `DropItem` | Drops | P1 |
| `HeartedItem` | Drops | P1 |
| `WaitlistEntry` | Onboarding | P1 |
| `ReferralCode` | Onboarding | P1 |
| Extended `NotificationType` (6 new values) | All features | P1 |
| Extended `Room` (add `type`, `memberIds[]`) | Introductions | P1 |

### 1.2 Cloud Functions

**Current (9 deployed):**
- `onUserCreate`, `onUserDelete` (Auth triggers)
- `onMessageCreated` (Firestore trigger)
- `refreshFcmToken`, `setTypingStatus`, `markMessagesRead` (Callable)
- `processRetryQueue`, `cleanupDevices` (Scheduled)
- `revenuecatWebhook` (HTTPS)

**New functions needed (34):**

| Category | Count | Functions |
|----------|-------|-----------|
| Auth/Profile | 4 | `linkedInExchangeCode`, `generateProfileBio`, `validateReferralCode`, `consumeReferralCode` |
| Introductions | 7 | `getRecommendedProfiles`, `saveConnection`, `unsaveConnection`, `sendIntroRequest`, `respondToIntro`, `getActivityCounts`, `generateMatchDescription` |
| Communities | 13 | `getRecommendedCommunities`, `getExploreCommunities`, `joinCommunity`, `leaveCommunity`, `requestToJoinCommunity`, `approveJoinRequest`, `createPost`, `createReply`, `togglePostLike`, `togglePostSave`, `getNoteworthy`, `getCommunityActivityFeed`, `archiveQuestion` |
| Drops | 5 | `getDrops`, `getDrop`, `heartItem`, `getHeartedItems`, `getFeaturedDrop` |
| Triggers | 5 | `onIntroCreated`, `onIntroAccepted`, `onPostCreated`, `onReplyCreated`, `onMemberJoined` |

### 1.3 Existing Functions That Need Updates

| Function | Change Required |
|----------|----------------|
| `onUserCreate` | Add `authProvider`, `providerUid` extraction; initialize profile fields with defaults |
| `onUserDelete` | Add cleanup for: savedConnections, heartedItems, savedPosts, questions, communityMemberships, introductions |
| `onMessageCreated` | No change needed |
| `Room` type | Add `type: "introduction"` and `memberIds: string[]` fields |
| `Notification` type | Expand `NotificationType` with 6 new values |

### 1.4 Security Rules

**Current:** Rules for users, rooms, messages, notifications, userReports, system collections.  
**Missing:** Rules for introductions, communities (members, joinRequests, posts, replies, likes), drops (sections, items), waitlist, and new user subcollections (savedConnections, heartedItems, savedPosts, questions, communityMemberships, matchCache).

### 1.5 Firestore Indexes

**Current:** 6 composite indexes (messages, notifications, userReports).  
**Target:** 14 composite indexes (+8 for introductions, communities, drops).

---

## 2. Implementation Phases

### Overview

```
Phase 0: Types & Foundation       │ Week 1    │ LLM
Phase 1: Auth & Profile           │ Week 1    │ LLM + Human
Phase 2: Drops Backend            │ Week 2    │ LLM + Human
Phase 3: Introductions Backend    │ Week 3-4  │ LLM + Human
Phase 4: Communities Backend      │ Week 4-6  │ LLM + Human
Phase 5: Home & Activity          │ Week 6    │ LLM
Phase 6: Security & Deploy        │ Week 7    │ LLM + Human
```

---

## Phase 0: Types & Foundation (Week 1, Day 1-2)

**Owner:** LLM  
**Duration:** ~4 hours  
**Blocked by:** Nothing  
**Unblocks:** Everything

### Task 0.1: Rewrite `types/index.ts`

Replace the current types file with the complete unified data model from `4-infra-and-data.md` §3.

**File:** `functions/src/types/index.ts`

**What changes:**
- Add 23 profile setup fields to `User` interface
- Add `AuthProvider` type
- Add `Child`, `DueDate`, all profile enum types
- Extend `NotificationPreferences` with per-feature toggles
- Add `Introduction`, `IntroductionStatus`
- Add `SavedConnection`, `MatchedProfile`, `ActivityCounts`
- Add `Community`, `CommunityCategory`, `CommunityJoinType`
- Add `CommunityMember`, `CommunityJoinRequest`
- Add `CommunityPost`, `PostReply`, `PostLike`
- Add `CommunityActivityItem`, `ActivityType`, `ActivityMetadata`
- Add `UserCommunityMembership`, `UserQuestion`, `SavedPost`
- Add `Drop`, `DropCategory`, `DropSection`, `DropItem`, `HeartedItem`
- Add `WaitlistEntry`
- Extend `Room` with `type` and `memberIds` fields
- Extend `NotificationType` with 6 new values
- Keep all existing types (Device, Message, ReadReceipt, etc.)

### Task 0.2: Create shared constants

**File:** `functions/src/utils/constants.ts` (NEW)

```typescript
export const REGION = "us-west2";
export const MAX_TOPIC_COMMUNITIES = 2;
export const MAX_MESSAGE_PAGINATION = 50;
export const INTRO_EXPIRY_DAYS = 14;
export const MAX_INTRO_PER_DAY = 10;
export const MATCHING_BATCH_SIZE = 20;
```

### Task 0.3: Verify build

```bash
cd functions && npm run build && npm run lint
```

**Deliverables:**
- [ ] `types/index.ts` rewritten with all interfaces from `4-infra-and-data.md`
- [ ] `utils/constants.ts` created
- [ ] Build passes

---

## Phase 1: Auth & Profile (Week 1, Day 2-3)

**Owner:** LLM + Human  
**Duration:** ~6 hours  
**Blocked by:** Phase 0 (types)  
**Unblocks:** All features (user profile is foundation)

### Task 1.1: Update `onUserCreate` trigger

**File:** `functions/src/triggers/auth/onUserCreate.ts`

**Changes:**
- Extract `authProvider` and `providerUid` from `user.providerData`
- Initialize all profile fields with sensible defaults (empty strings, empty arrays, false booleans)
- Set `profileSetupCompleted: false`
- Handle LinkedIn custom token users (may not have `displayName`)
- Handle Apple relay email

**Key code:**
```typescript
const providerData = user.providerData?.[0];
const authProvider = providerData?.providerId || "unknown";

const userProfile: User = {
  uid: userId,
  email: user.email || "",
  displayName: user.displayName || "",
  photoURL: providerData?.photoURL || user.photoURL || "",
  authProvider: authProvider as AuthProvider,
  providerUid: providerData?.uid || "",
  // Profile setup defaults
  firstName: "",
  lastInitial: "",
  zipCode: "",
  city: "",
  state: "",
  county: "",
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
  generatedBio: "",
  bioApproved: false,
  profileSetupCompleted: false,
  // Subscription
  subscriptionStatus: "free",
  notificationPreferences: { enabled: true },
  createdAt: FieldValue.serverTimestamp(),
  lastSeen: FieldValue.serverTimestamp(),
};
```

### Task 1.2: Update `onUserDelete` trigger

**File:** `functions/src/triggers/auth/onUserDelete.ts`

**Add cleanup for new subcollections:**
- `users/{uid}/savedConnections`
- `users/{uid}/heartedItems`
- `users/{uid}/savedPosts`
- `users/{uid}/questions`
- `users/{uid}/communityMemberships`
- `users/{uid}/matchCache`
- Remove user from all community member subcollections
- Delete or update introductions where user is `fromUserId` or `toUserId`

### Task 1.3: Create `generateProfileBio` callable

**File:** `functions/src/callable/generateProfileBio.ts` (NEW)

**Purpose:** Generate AI-powered bio from profile data.

**Implementation:**
- Accept `{ profile: ProfileSetupData, feedback?: string, regenerate?: boolean }`
- Use OpenAI or Gemini API to generate 2-3 sentence bio
- Fallback to template if AI fails
- Rate limit: 5/minute per user
- Store secret: `OPENAI_API_KEY` or `GEMINI_API_KEY` in Secret Manager

**Prompt engineering:**
```
You are writing a short, warm bio for a mom on Raine, a social app for mothers.
Based on her profile: [firstName] from [city], mom of [childCount] ([children details]).
She's into [beforeMotherhood], loves [perfectWeekend] weekends, and her vibe is [aesthetic].
Write a 2-3 sentence bio in first person that feels authentic and inviting.
```

### Task 1.4: Create referral code functions

**Source:** `RaineApp/documents/PLAN-A-BACKEND-INTEGRATION.md` Tasks 8-9  
**Note:** These were identified in the frontend-focused plan and were missing from the original backend upgrade plan.

**File:** `functions/src/callable/validateReferralCode.ts` (NEW)

**Purpose:** Validate a referral code during onboarding.
- Input: `{ code: string }`
- Check `referralCodes/{code}` document exists and is not fully consumed
- Return: `{ valid: boolean, error?: string }`
- Auth: Required

**File:** `functions/src/callable/consumeReferralCode.ts` (NEW)

**Purpose:** Mark a referral code as used after successful signup.
- Input: `{ code: string }`
- Atomically increment `usedCount` on `referralCodes/{code}`
- Create `referralCodes/{code}/usedBy/{userId}` record
- Return: `{ success: boolean }`
- Auth: Required

**Referral Code data model:**
```typescript
// referralCodes/{code}
interface ReferralCode {
  code: string;
  createdBy: string;           // Admin or referring user
  maxUses: number;             // -1 for unlimited
  usedCount: number;
  active: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}
```

**Security rules addition (in Phase 6):**
```javascript
match /referralCodes/{code} {
  allow read: if isAuthenticated();  // Validate
  allow write: if false;             // Functions only
  match /usedBy/{userId} {
    allow read, write: if false;     // Functions only
  }
}
```

### Task 1.5: Create `linkedInExchangeCode` HTTP endpoint

**File:** `functions/src/webhooks/linkedInAuth.ts` (NEW)

**Type:** `onRequest` (POST) — NOT `onCall` (user isn't authenticated yet)

**Flow:**
1. Validate POST method and input
2. Exchange code for LinkedIn access token
3. Fetch user profile from LinkedIn `/v2/userinfo`
4. Create or update Firebase Auth user (`linkedin:{sub}`)
5. Set `displayName` and `email` on Auth record
6. Generate custom token
7. Return `{ customToken }`

**Secrets:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### Task 1.6: Resolve `subscriptionStatus` enum

**Source:** `RaineApp/documents/PLAN-A-BACKEND-INTEGRATION.md` Task 4  
**Issue:** Backend uses `"free"` for new users. Frontend may check for `"none"`.

**Decision required:** Align on one value. Plan A recommends `"none"`, our current backend uses `"free"`.

**If changing to `"none"`:** Update in 3 files:
- `functions/src/types/index.ts` — Change enum
- `functions/src/triggers/auth/onUserCreate.ts` — Default value
- `functions/src/webhooks/revenuecat.ts` — EXPIRATION handler sets status

**If keeping `"free"`:** Frontend must update to check for `"free"` instead of `"none"`.

**Recommendation:** Keep `"free"` — it's more descriptive and already deployed. Frontend adapts (1 file change).

### Task 1.7: Export new functions

**File:** `functions/src/index.ts`

Add:
```typescript
export {generateProfileBio} from "./callable/generateProfileBio";
export {validateReferralCode} from "./callable/validateReferralCode";
export {consumeReferralCode} from "./callable/consumeReferralCode";
export {linkedInExchangeCode} from "./webhooks/linkedInAuth";
```

### Task 1.8: Human Tasks

- [ ] Create AI API key (OpenAI or Gemini)
- [ ] `firebase functions:secrets:set OPENAI_API_KEY` (or `GEMINI_API_KEY`)
- [ ] `firebase functions:secrets:set LINKEDIN_CLIENT_ID`
- [ ] `firebase functions:secrets:set LINKEDIN_CLIENT_SECRET`
- [ ] Deploy: `firebase deploy --only functions`

**Deliverables:**
- [ ] `onUserCreate` stores auth provider + initializes all profile fields
- [ ] `onUserDelete` cleans up all new subcollections
- [ ] `generateProfileBio` callable deployed
- [ ] `validateReferralCode` callable deployed
- [ ] `consumeReferralCode` callable deployed
- [ ] `linkedInExchangeCode` HTTP endpoint deployed
- [ ] `subscriptionStatus` enum decision made and applied
- [ ] All secrets configured
- [ ] Total functions: 13

---

## Phase 2: Drops Backend (Week 2)

**Owner:** LLM + Human  
**Duration:** ~6 hours  
**Blocked by:** Phase 0 (types)  
**Unblocks:** Frontend Drops implementation  
**Why first:** Simplest feature — read-only content with save/heart. No real-time, no user-generated content.

### Task 2.1: Create Drops callable functions

**Directory:** `functions/src/callable/drops/` (NEW)

**Files:**

**`getDrops.ts`** — Return published drops, optionally filtered by category.
- Query: `drops` where `published == true`, order by `publishedAt` desc
- If category provided: add `category == X` filter
- Return: `Drop[]` (without sections/items — just cover data)

**`getDrop.ts`** — Return full drop with sections and items.
- Fetch drop document
- Fetch all sections ordered by `order`
- For each section, fetch all items ordered by `order`
- Return: `{ drop, sections: [{ section, items }] }`

**`heartItem.ts`** — Toggle heart on a product item.
- Check if `users/{uid}/heartedItems/{itemId}` exists
- If exists: delete (unheart), decrement `heartCount` on item
- If not: create with cached fields, increment `heartCount`
- Return: `{ hearted: boolean }`

**`getHeartedItems.ts`** — Return user's hearted items.
- Query: `users/{uid}/heartedItems` order by `heartedAt` desc
- Return: `HeartedItem[]`

**`getFeaturedDrop.ts`** — Return current featured drop for Home.
- Query: `drops` where `isFeatured == true` order by `publishedAt` desc limit 1
- Return: `Drop` (cover data only)

### Task 2.2: Export Drops functions

**File:** `functions/src/index.ts`

Add:
```typescript
export {getDrops} from "./callable/drops/getDrops";
export {getDrop} from "./callable/drops/getDrop";
export {heartItem} from "./callable/drops/heartItem";
export {getHeartedItems} from "./callable/drops/getHeartedItems";
export {getFeaturedDrop} from "./callable/drops/getFeaturedDrop";
```

### Task 2.3: Human Tasks

- [ ] Deploy: `firebase deploy --only functions`
- [ ] Seed test drop data via Firestore Console:
  - Create 1 drop document in `drops/`
  - Create 2-3 sections in `drops/{id}/sections/`
  - Create 3-5 items per section in `drops/{id}/sections/{id}/items/`
  - Set `isFeatured: true` on one drop
- [ ] Test endpoints via emulator or curl

**Deliverables:**
- [ ] 5 Drops callable functions deployed
- [ ] Test data seeded
- [ ] Total functions: 16

---

## Phase 3: Introductions Backend (Weeks 3-4)

**Owner:** LLM + Human  
**Duration:** ~16 hours  
**Blocked by:** Phase 1 (user profile with all fields — needed for matching)  
**Unblocks:** Frontend Introductions tab

### Task 3.1: Create matching service

**File:** `functions/src/services/matching.ts` (NEW)

**Purpose:** Score and rank user profiles by compatibility.

**Matching factors:**

| Factor | Weight | Comparison |
|--------|--------|-----------|
| Same city | 30 | Exact match on `city` |
| Similar children ages | 25 | Age difference < 12 months |
| Both expecting | 20 | Both `isExpecting == true` |
| Shared interests | 15 | Overlap in `beforeMotherhood`, `perfectWeekend` |
| Compatible friend style | 10 | Overlap in `momFriendStyle` |

**Algorithm:**
1. Query users in same `city` + `state` (primary filter)
2. Exclude: current user, already connected, already saved, declined
3. Score each candidate by weighted factors
4. Sort by score descending
5. Return top N with `matchDescription` (template-based for MVP, AI later)

**Match description templates:**
- Same city + similar kids: "Fellow {city} mom with {age}-old too"
- Shared interests: "Both {interest1} and {interest2} enthusiasts"
- Same childcare approach: "Shares your {momFriendStyle} style"

### Task 3.2: Create Introductions callable functions

**Directory:** `functions/src/callable/introductions/` (NEW)

**`getRecommendedProfiles.ts`** — Return matched profiles.
- Call matching service
- Exclude users already in `savedConnections` or with active `introductions`
- Return: `MatchedProfile[]`

**`saveConnection.ts`** — Save a profile for later.
- Create `users/{uid}/savedConnections/{targetUserId}`
- Compute `mutualCommunities` count
- Generate `matchDescription`
- Return: `{ success: true }`

**`unsaveConnection.ts`** — Remove from saved.
- Delete `users/{uid}/savedConnections/{targetUserId}`
- Return: `{ success: true }`

**`sendIntroRequest.ts`** — Send "Say Hi" intro request.
- Create `introductions/{id}` with status `pending`
- Set `fromUserId`, `toUserId`, `createdAt`
- Triggers `onIntroCreated` (push notification)
- Rate limit: 10/day per user
- Return: `{ success: true, introId }`

**`respondToIntro.ts`** — Accept or decline intro request.
- Update `introductions/{id}` status to `active` or `declined`
- If accepted: create 1:1 Room, set `roomId` on intro
- Triggers `onIntroAccepted` (notification to sender)
- Return: `{ success: true, roomId? }`

**`getActivityCounts.ts`** — Aggregate counts for Home dashboard.
- Count pending intros where `toUserId == currentUser`
- Count unread messages across active rooms (from intro rooms)
- Count `users/{uid}/savedPosts` (saved tips)
- Count unread answers on `users/{uid}/questions`
- Return: `ActivityCounts`

### Task 3.3: Create Introductions triggers

**Directory:** `functions/src/triggers/firestore/` (extend)

**`onIntroCreated.ts`** (NEW) — On new introduction document.
- Send push notification to `toUserId`: "{name} wants to say hi!"
- Create in-app notification

**`onIntroAccepted.ts`** (NEW) — On intro status change to `active`.
- Create Room document with `type: "introduction"`, `memberIds: [from, to]`
- Create member subcollection entries for both users
- Create `roomMemberships` on both users
- Notify sender: "{name} accepted your intro!"

### Task 3.4: Update Room model

**File:** `functions/src/triggers/firestore/onMessageCreated.ts`

**Changes:**
- Room now has `type` field (currently `"introduction"`, future: `"group"`)
- Room now has `memberIds[]` array (for frontend queries)
- `onMessageCreated` should also update `lastMessageAt` on the `introductions` doc (for sorting active conversations)

### Task 3.5: Export Introductions functions

**File:** `functions/src/index.ts`

Add all 7 callable + 2 trigger exports.

### Task 3.6: Human Tasks

- [ ] Deploy: `firebase deploy --only functions`
- [ ] Test matching: Create 3-5 test users with overlapping profiles
- [ ] Test intro flow: Send request → accept → verify room created
- [ ] Verify push notifications fire

**Deliverables:**
- [ ] Matching service with scoring algorithm
- [ ] 7 Introductions callable functions deployed
- [ ] 2 Firestore triggers deployed
- [ ] Room model extended with `type` and `memberIds`
- [ ] Total functions: 25

---

## Phase 4: Communities Backend (Weeks 4-6)

**Owner:** LLM + Human  
**Duration:** ~24 hours  
**Blocked by:** Phase 1 (user profile — needed for community recommendation)  
**Unblocks:** Frontend Communities tab  
**Note:** This is the most complex phase. Break into sub-phases.

### Sub-Phase 4A: Core Community Functions (Week 4)

**Directory:** `functions/src/callable/communities/` (NEW)

**`getRecommendedCommunities.ts`** — Communities matching user profile.
- Match by: `location.city == user.city` (location category)
- Match by: `childAgeRange` overlapping user's children ages (child_age category)
- Match by: `experienceTags` overlapping user's interests (experience category)
- Return communities grouped by category

**`getExploreCommunities.ts`** — Browse all communities with filters.
- Accept: `{ topic?, stage?, size? }`
- Query `communities` with filters
- Exclude already-joined communities
- Return: `Community[]`

**`joinCommunity.ts`** — Join a community (auto-join type).
- Validate `joinType == 'auto'` or user has approved request
- Create `communities/{id}/members/{uid}` document
- Create `users/{uid}/communityMemberships/{communityId}` inverse lookup
- Increment `memberCount` on community
- Return: `{ success }`

**`leaveCommunity.ts`** — Leave a community.
- Delete member document + inverse lookup
- Decrement `memberCount`
- Return: `{ success }`

**`requestToJoinCommunity.ts`** — Request to join (request type).
- Validate `joinType == 'request'`
- Check topic community limit (max 2)
- Create `communities/{id}/joinRequests/{uid}`
- Notify community admins
- Return: `{ success, requestId }`

**`approveJoinRequest.ts`** — Admin approves join request.
- Validate caller is community admin
- Update join request status to `approved`
- Call `joinCommunity` logic internally
- Notify requesting user
- Return: `{ success }`

### Sub-Phase 4B: Post & Reply Functions (Week 5)

**`createPost.ts`** — Create community post.
- Validate user is community member
- Create `communities/{id}/posts/{postId}`
- Cache author name and photo on post document
- If post is a question (from "ASK THE MOMS" input): also create `users/{uid}/questions/{postId}`
- Rate limit: 10 posts per hour
- Return: `{ success, postId }`

**`createReply.ts`** — Reply to a post.
- Validate user is community member
- Create `communities/{id}/posts/{postId}/replies/{replyId}`
- Increment `commentCount` on parent post
- If post author has a question entry: increment `answerCount` on `users/{authorId}/questions/{postId}`
- Trigger: notify post author
- Return: `{ success, replyId }`

**`togglePostLike.ts`** — Like/unlike a post.
- Check if `communities/{id}/posts/{postId}/likes/{uid}` exists
- Toggle: create or delete
- Update `likeCount` on post
- Return: `{ liked }`

**`togglePostSave.ts`** — Bookmark/unbookmark a post.
- Check if `users/{uid}/savedPosts/{postId}` exists
- Toggle: create or delete
- Update `saveCount` on post
- Return: `{ saved }`

**`getNoteworthy.ts`** — Top posts for community detail.
- Query posts where `isNoteworthy == true` or sort by `likeCount` desc
- Limit to 10
- Return: `CommunityPost[]`

### Sub-Phase 4C: Activity & Questions (Week 6)

**`getCommunityActivityFeed.ts`** — Cross-community activity feed.
- Get user's joined communities from memberships
- For each community: get recent posts with reply counts
- Merge and sort by timestamp
- Annotate with activity types (hot topic, new members, etc.)
- Optional: filter by specific communityId
- Return: `CommunityActivityItem[]`

**`archiveQuestion.ts`** — Archive a user's question.
- Update `users/{uid}/questions/{questionId}` status to `archived`
- Return: `{ success }`

### Sub-Phase 4D: Community Triggers (Week 5-6)

**`onPostCreated.ts`** (NEW) — On new community post.
- Update community `lastActivityAt`
- Increment community `postCount`
- Flag as noteworthy if meets criteria (e.g., from admin)

**`onReplyCreated.ts`** (NEW) — On new reply.
- Increment post `commentCount`
- Send push notification to post author
- Update `users/{authorId}/questions/{postId}.answerCount` if applicable

**`onMemberJoined.ts`** (NEW) — On new community member.
- Update community `memberCount`
- Log activity (for activity feed: "New members")

### Sub-Phase 4E: Export & Test

Add all 13 callable + 3 trigger exports to `index.ts`.

### Human Tasks

- [ ] Deploy: `firebase deploy --only functions`
- [ ] Seed community data via Firestore Console:
  - Create 3 communities (1 location, 1 age, 1 experience)
  - Set appropriate `joinType`, `category`, `tags`
  - Create a few seed posts with replies
- [ ] Test full flow: join → post → reply → like → save → activity feed

**Deliverables:**
- [ ] 13 Communities callable functions deployed
- [ ] 3 Firestore triggers deployed
- [ ] Community seed data created
- [ ] Total functions: 41

---

## Phase 5: Home & Activity Aggregation (Week 6)

**Owner:** LLM  
**Duration:** ~4 hours  
**Blocked by:** Phases 2, 3, 4 (needs all features for aggregation)  
**Note:** `getActivityCounts` was created in Phase 3 but may need updates.

### Task 5.1: Update `getActivityCounts`

Update to aggregate from all features:

```typescript
{
  introRequests: count(introductions where toUserId == me AND status == 'pending'),
  unreadMessages: count(unread messages across all intro rooms),
  savedTips: count(users/{uid}/savedPosts),
  questionResponses: count(users/{uid}/questions where answerCount > lastSeenAnswerCount)
}
```

### Task 5.2: Update `cleanupDevices` scheduled function

Add cleanup for:
- Expired introductions (status → `expired` after 14 days)
- Old activity items
- Orphaned community memberships

### Task 5.3: Update `processRetryQueue`

No changes needed — already handles notification retries.

**Deliverables:**
- [ ] `getActivityCounts` aggregates all features
- [ ] `cleanupDevices` handles intro expiry

---

## Phase 6: Security, Rules & Deploy (Week 7)

**Owner:** LLM + Human  
**Duration:** ~6 hours

### Task 6.1: Replace Firestore security rules

**File:** `firestore/firestore.rules`

Replace with complete rules from `4-infra-and-data.md` §5. This adds rules for:
- User subcollections (savedConnections, heartedItems, savedPosts, questions, communityMemberships, matchCache)
- Introductions (read only by participants, write only by functions)
- Communities (members, joinRequests, posts, replies, likes)
- Drops (read-only for all authenticated users)
- Waitlist (create-only)

### Task 6.2: Replace Firestore indexes

**File:** `firestore/firestore.indexes.json`

Replace with complete indexes from `4-infra-and-data.md` §6. Adds 8 new composite indexes for introductions, communities, and drops.

### Task 6.3: Update Storage rules

**File:** `storage/storage.rules`

Update photo size limit from 5MB to 10MB. Add community cover and drops paths (admin-only write).

### Task 6.4: Full deployment

```bash
cd /path/to/Raine/Raine-bk

# Build and lint
cd functions && npm run lint && npm run build && cd ..

# Deploy everything
firebase deploy
```

### Task 6.5: Verification

```bash
# Verify all functions deployed
firebase functions:list
# Expected: 43 functions

# Test webhook still works
curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://us-west2-raineapp-backend.cloudfunctions.net/revenuecatWebhook \
  -H "Authorization: Bearer wrong" \
  -d '{}'
# Expected: 401
```

### Task 6.6: Human Tasks

- [ ] Deploy: `firebase deploy`
- [ ] Verify 43 functions in `firebase functions:list`
- [ ] Verify security rules applied in Firebase Console → Firestore → Rules
- [ ] Verify indexes deploying (may take minutes) in Firebase Console → Firestore → Indexes
- [ ] Run smoke tests for each feature

**Deliverables:**
- [ ] All 43 functions deployed
- [ ] Complete security rules deployed
- [ ] 14 composite indexes deployed
- [ ] Storage rules updated
- [ ] All smoke tests pass

---

## 3. File Structure (Target)

```
functions/src/
├── index.ts                              # All 41 exports
├── types/
│   └── index.ts                          # Complete unified types (rewritten)
├── utils/
│   ├── helpers.ts                        # Existing utilities
│   └── constants.ts                      # NEW: shared constants
├── services/
│   ├── notifications.ts                  # Existing: push notification service
│   ├── rateLimit.ts                      # Existing: rate limiting
│   └── matching.ts                       # NEW: profile matching algorithm
├── triggers/
│   ├── auth/
│   │   ├── onUserCreate.ts              # UPDATED: profile fields + auth provider
│   │   └── onUserDelete.ts              # UPDATED: cleanup new subcollections
│   └── firestore/
│       ├── onMessageCreated.ts          # UPDATED: update intro lastMessageAt
│       ├── onIntroCreated.ts            # NEW: notify recipient
│       ├── onIntroAccepted.ts           # NEW: create room, notify sender
│       ├── onPostCreated.ts             # NEW: update community activity
│       ├── onReplyCreated.ts            # NEW: update counts, notify author
│       └── onMemberJoined.ts            # NEW: update member count
├── callable/
│   ├── refreshFcmToken.ts               # Existing
│   ├── setTypingStatus.ts               # Existing
│   ├── markMessagesRead.ts              # Existing
│   ├── generateProfileBio.ts            # NEW: AI bio generation
│   ├── validateReferralCode.ts          # NEW: referral code validation
│   ├── consumeReferralCode.ts           # NEW: referral code consumption
│   ├── introductions/                    # NEW directory
│   │   ├── getRecommendedProfiles.ts
│   │   ├── saveConnection.ts
│   │   ├── unsaveConnection.ts
│   │   ├── sendIntroRequest.ts
│   │   ├── respondToIntro.ts
│   │   └── getActivityCounts.ts
│   ├── communities/                      # NEW directory
│   │   ├── getRecommendedCommunities.ts
│   │   ├── getExploreCommunities.ts
│   │   ├── joinCommunity.ts
│   │   ├── leaveCommunity.ts
│   │   ├── requestToJoinCommunity.ts
│   │   ├── approveJoinRequest.ts
│   │   ├── createPost.ts
│   │   ├── createReply.ts
│   │   ├── togglePostLike.ts
│   │   ├── togglePostSave.ts
│   │   ├── getNoteworthy.ts
│   │   ├── getCommunityActivityFeed.ts
│   │   └── archiveQuestion.ts
│   └── drops/                            # NEW directory
│       ├── getDrops.ts
│       ├── getDrop.ts
│       ├── heartItem.ts
│       ├── getHeartedItems.ts
│       └── getFeaturedDrop.ts
├── webhooks/
│   ├── revenuecat.ts                    # Existing
│   └── linkedInAuth.ts                  # NEW: LinkedIn OAuth
└── scheduled/
    ├── processRetryQueue.ts             # Existing
    └── cleanupDevices.ts                # UPDATED: intro expiry + community cleanup
```

**New files:** 30  
**Modified files:** 5 (types, index, onUserCreate, onUserDelete, cleanupDevices)  
**Unchanged files:** 9

---

## 4. Deployment Sequence

| Step | Command | When | Functions |
|------|---------|------|-----------|
| 1 | `npm run build && npm run lint` | After each phase | 0 (verification) |
| 2 | `firebase deploy --only functions` | Phase 1 complete | 13 (4 new) |
| 3 | `firebase deploy --only functions` | Phase 2 complete | 18 (5 new) |
| 4 | `firebase deploy --only functions` | Phase 3 complete | 27 (9 new) |
| 5 | `firebase deploy --only functions` | Phase 4 complete | 43 (16 new) |
| 6 | `firebase deploy` | Phase 6 complete | 43 + rules + indexes |

**Incremental deployment** — Each phase results in a working, deployable state. No big-bang deployment needed.

---

## 5. Secrets Required

| Secret | Phase | Command |
|--------|-------|---------|
| `REVENUECAT_WEBHOOK_SECRET` | ✅ Already set | — |
| `OPENAI_API_KEY` or `GEMINI_API_KEY` | Phase 1 | `firebase functions:secrets:set OPENAI_API_KEY` |
| `LINKEDIN_CLIENT_ID` | Phase 1 | `firebase functions:secrets:set LINKEDIN_CLIENT_ID` |
| `LINKEDIN_CLIENT_SECRET` | Phase 1 | `firebase functions:secrets:set LINKEDIN_CLIENT_SECRET` |

---

## 6. Dependencies on Frontend

| Backend Phase | Frontend Phase (from MASTER-IMPLEMENTATION-PLAN) | Notes |
|--------------|--------------------------------------------------|-------|
| Phase 0-1 (Types + Auth) | Phase 0 (Critical Backend Integration) | Must complete before frontend connects |
| Phase 2 (Drops) | Phase 3 (Drops Feature, Week 3-4) | Backend must be ready 1 week ahead |
| Phase 3 (Introductions) | Phase 4 (Introductions Feature, Week 4-6) | Matching service critical |
| Phase 4 (Communities) | Phase 5 (Communities Feature, Week 6-9) | Most complex, allow overlap |
| Phase 5 (Home) | Phase 2 (Home Dashboard, Week 2-3) | Home uses mock data initially |
| Phase 6 (Security) | Phase 7 (Polish & Launch) | Final security audit |

---

## 7. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI bio generation costs | Unexpected API costs | Set hard rate limit (5/min/user), use prompt caching, fallback to templates |
| Matching algorithm performance | Slow Home tab load | Pre-compute matches as scheduled job, cache in `matchCache` |
| Community post volume | High Firestore reads | Pagination (20 posts/page), cached counts, composite indexes |
| 41 functions = cold starts | Slow first request | Group related functions in same file where possible, use min instances for critical paths |
| Incremental deployment conflicts | Partial feature states | Each phase is self-contained and backward compatible |
| Index deployment time | Build delays | Deploy indexes early (Phase 6 can start in parallel with Phase 4) |

---

## 8. Estimated Effort Summary

| Phase | LLM Hours | Human Hours | Calendar |
|-------|-----------|-------------|----------|
| Phase 0: Types | 4 | 0 | Day 1-2 |
| Phase 1: Auth/Profile | 4 | 2 | Day 2-3 |
| Phase 2: Drops | 4 | 2 | Week 2 |
| Phase 3: Introductions | 12 | 4 | Week 3-4 |
| Phase 4: Communities | 18 | 6 | Week 4-6 |
| Phase 5: Home/Activity | 4 | 0 | Week 6 |
| Phase 6: Security/Deploy | 4 | 2 | Week 7 |
| **Total** | **50** | **16** | **7 weeks** |

---

**Document Version:** 1.0  
**Status:** Ready for execution  
**First Action:** Begin Phase 0 (rewrite `types/index.ts`)
