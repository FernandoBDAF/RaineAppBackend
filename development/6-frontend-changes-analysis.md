# RaineApp Frontend Changes Analysis
## From commit 29de8bc to HEAD

**Date:** February 2026  
**Scope:** 86 files changed — 3,726 insertions, 3,081 deletions  
**Commits covered:** 22 commits (from `288bea8` iOS configurations through `9190664` Adjust connections)

---

## Executive Summary

This document analyses all changes made to RaineApp since the last joint session.
The work falls into five major themes:

1. **Firebase is now real** — mock mode was removed entirely and replaced with live Firebase connections
2. **Email/password auth replaced social login** — the social login flow was discarded and a standard email + password flow was introduced
3. **A connections system was built** — a new Firestore `connections` collection models social introductions with accept/decline/cancel
4. **The data layer was hardened** — `UserProfile` is now validated with Zod, `profileSetupCompletedAt` replaces the boolean `completed` flag, and profile data syncs from Firestore on login
5. **The build config was migrated** — `app.json` became `app.config.js`, EAS profiles were overhauled, and a custom iOS plugin was added for Firebase

---

## 1. Removal of Mock Mode

### What changed

`src/config/environment.ts` was stripped of the `isDev` check that forced mock mode in all development environments. Previously, `isFirebaseMockMode()` always returned `true` during development because the Facebook SDK was not configured. Now it returns only `_firebaseMockMode`, which is a flag that is never set to `true` in the current codebase — effectively meaning **mock mode is always off**.

`src/app/_layout.tsx` removed the entire `checkFirebase()` async startup routine that dynamically checked for Firebase apps at boot time and conditionally enabled mock mode.

All `isFirebaseMockMode()` guard clauses were stripped from `users.ts`, `rooms.ts`, `messages.ts`, and `firestore.ts`. These services now call Firebase directly without fallback.

### Impact

The app requires Firebase to be fully configured at runtime. Running without `google-services.json` or `GoogleService-Info.plist` will crash. The `EXPO_PUBLIC_FIREBASE_*` environment variables in `eas.json` are now the source of credentials for preview builds.

### Design rationale

This is the correct next step after the mock-first development phase. Mock mode was a scaffold that allowed UI development without a backend; once the backend was real and stable, the scaffold had to be removed. The decision avoids a dual-code-path problem where bugs in the real path could go undetected during development.

---

## 2. Authentication Overhaul

### What changed

#### Social login removed

The entire `src/services/firebase/socialAuth.ts` file was deleted (92 lines). This removed the Instagram, Facebook, and LinkedIn social login buttons from the login screen. The `SocialButton` component is no longer used in auth.

The old `src/features/auth/AuthContext.tsx` was deleted and replaced with `src/context/auth/AuthContext.tsx`. The directory change (`features/` → `context/`) signals an architectural intent: auth is now a cross-cutting concern (context) rather than a product feature.

#### Email/password login added

`src/app/(auth)/login.tsx` was completely rewritten from social buttons to an email + password form. The screen now uses the `Input` component with a password toggle, inline validation, and Firebase error code mapping via `src/utils/errorsFilters.ts`.

`src/app/(auth)/signup.tsx` is a new file (137 lines). It handles account creation with email, password, and password confirmation. It guards access with a referral code check — if no validated referral is present in MMKV, it immediately redirects to the referral screen.

#### New AuthContext behaviour

The new `AuthContext.tsx` adds profile hydration to the auth state change listener:

```typescript
const profile = await getUserProfile(firebaseUser.uid);
if (profile?.profileSetupCompletedAt) {
  syncFromUserProfile(profile); // Firestore is source of truth
} else if (profile) {
  // User is mid-setup — keep local persisted data
}
```

On login, if the user has completed profile setup (evidenced by `profileSetupCompletedAt` being non-null in Firestore), the store is immediately synced from Firestore. This means returning users see their correct data without re-entering anything. Mid-setup users keep their local MMKV state, which correctly resumes from where they left off.

#### Anonymous auth for referral validation

`src/hooks/useReferralCode.ts` (new, 37 lines) uses anonymous Firebase Auth to authenticate a Firestore query that checks whether a referral code already exists. The anonymous user is immediately deleted after the check. This was needed because Firestore security rules require an authenticated caller even for validation queries.

### Impact

- Users must have an account in Firebase Auth (email/password)
- Social login is no longer available (not even as a future option unless re-introduced)
- The referral code check now validates against the live Firestore `users` collection (field `referralCode`) rather than just format-checking locally

### Design rationale

Social login via Facebook SDK required a Facebook App ID, which created a dependency on a third-party developer account and a complex build configuration. Email/password auth is simpler to operate and eliminates the Facebook SDK crash problem permanently. The trade-off is that the "no strangers, friends of friends" invite metaphor is now enforced solely by the referral code system rather than by the social graph of the login provider.

---

## 3. Connections System

### What changed

A new `connections` Firestore collection was introduced with a document-per-user model: each user has exactly one document, keyed by their UID, containing a `connectionDetailsList` array.

#### Data model

```typescript
interface ConncetionDetails {
  userConnectedUid: string;
  whoConnected: 'me' | 'them';
  connectionAcceptedAt: Timestamp | null;
  connectionRejectedAt: Timestamp | null;
  createdAt?: Date;
}

interface Connection {
  userId: string;
  connectionDetailsList: ConncetionDetails[];
  createdAt: Timestamp;
}
```

The `whoConnected` field distinguishes who initiated the connection without requiring a separate collection. A `'me'` entry with `connectionAcceptedAt == null` means "I sent a request to them, waiting". A `'them'` entry with `connectionAcceptedAt == null` means "they sent me a request, I haven't responded".

#### Service layer

`src/services/firebase/connections.ts` (98 lines) provides the Firestore CRUD layer: `setConnection`, `updateConnectionById`, `updateConnectionDetailsById`, `cancelConnectionRequest`, `getConnectionsByConnectionUserUid`.

`src/services/connections/connections-functions.ts` (63 lines) is the business logic layer. `generateConnection(uid, profile)` reads both users' connection documents, appends a new detail entry to each (idempotently), then writes both atomically via `Promise.all`.

#### UI integration

`MomsLikeYouCarousel` was extensively rewritten (from 34 to 215 lines). It now:
- Loads real profiles from Firestore via `useMomsLikeYou` (random users who have completed profile setup)
- Loads the current user's connection list via `useConnectionsWithProfiles`
- Computes `connectionStatusByUid` (one of: `'none'`, `'pending'`, `'pending_incoming'`, `'connected'`)
- Renders `MatchProfileCard` with the correct action buttons based on status
- Handles accept, decline, cancel, and send-message actions inline

The carousel merges random discovery profiles (from home service) with connected profiles so that existing connections always appear in the carousel even if they weren't in the random fetch.

#### Hooks

`useConnectionsWithProfiles` (73 lines) orchestrates two cascading React Query queries: first connections, then profiles for each connected UID. It memoizes the `profileMapByUid` to avoid re-renders.

`useMomsLikeYou` (34 lines) wraps `momsLikeYouStore.fetchRandomUsers` with a `useRef` guard to prevent refetch loops when the result set is empty.

### Impact

The connections system replaces what was placeholder data in the Introductions tab. Users can now actually connect, and the connection state persists in Firestore in real time.

### Design rationale

The single-document-per-user design avoids collection group queries and makes it trivial to load all connections for a user in one read. The `whoConnected` field was chosen over a separate "pending" subcollection because it keeps all connection state in one document, enabling a single `onSnapshot` listener in future. The `Promise.all` write pattern is a pragmatic choice — it is not atomic in Firestore terms (there is no transaction), but the risk of a partial write is acceptable because the connection is re-creatable and idempotent.

---

## 4. Data Layer Hardening

### What changed

#### `UserProfile` validated with Zod

`src/types/user.ts` was completely rewritten. The simple TypeScript interface was replaced with a Zod schema (`userProfileSchema`) that:
- Validates the Firestore `Timestamp` type with a custom validator
- Applies defaults for every field (empty string, 0, false, null, [])
- Transforms the `dueDate` field from string format (e.g. `"3/2026"`) to `{ month, year }` object
- Parses `profileSetupCompletedAt` as a nullable Timestamp

The `UserProfile` type is now `z.infer<typeof userProfileSchema>` — the type and validator are derived from the same source. Any invalid Firestore document is rejected with a console error rather than crashing.

#### `profileSetupCompletedAt` replaces `completed: boolean`

The profile setup flag changed from `completed: boolean` to `profileSetupCompletedAt: string | null` (stored as ISO string in MMKV, as Firestore Timestamp in the database). This is semantically richer — it records *when* setup was completed, not just *whether* it was. The `_layout.tsx` guard now uses `!!profileSetupCompletedAt` as the completion check.

#### `syncFromUserProfile` added to store

`profileSetupStore` gained a `syncFromUserProfile(profile: UserProfile)` action that maps all Firestore fields back into the Zustand/MMKV store. This is the inverse of `saveProfileSetup`. It is called from `AuthContext` when a returning user logs in.

`syncFromFirestore(uid)` is a convenience async action that fetches the profile and calls `syncFromUserProfile`. It allows any component to trigger a Firestore-to-store sync without knowing about the auth flow.

#### `getUserProfiles` added

`users.ts` gained `getUserProfiles(uids: string[])` which uses a Firestore `where('uid', 'in', uids)` query to batch-fetch multiple profiles. This is used by `useConnectionsWithProfiles` to load profiles of connected users.

`isReferralCodeTaken(code)` was added for the signup validation flow.

### Impact

Data entering the app from Firestore is now validated at the boundary. Type errors that would previously propagate silently and cause rendering crashes are now caught and logged. The Zod schema is the single source of truth for what a valid `UserProfile` looks like.

### Design rationale

Zod was chosen over manual validation because it generates the TypeScript type automatically, keeping schema and types in sync. The `safeParse` pattern allows graceful degradation — an invalid document returns `null` rather than throwing, which is the right behaviour for a social app where partial data is common during active development.

---

## 5. Build Configuration Migration

### What changed

#### `app.json` → `app.config.js`

The static `app.json` was deleted and replaced with `app.config.js`. This is a JS module that exports the same config object. The key advantages over static JSON:
- Can use environment variables directly at config build time
- Can add comments
- Can use JS logic (e.g. conditional plugins)

The new config adds `@react-native-firebase/messaging` to the plugins array and references `./plugins/ios-fix-rnfirebase.js`.

The EAS `projectId` changed from `4df1738a-f338-4b36-9bd2-1370bd095e15` (fernandobdaf account) to `90743f25-a1d2-4070-8d97-7716eb395973` (filipemendonca account), and `owner` changed accordingly. This indicates the project was transferred to a different Expo account.

#### Custom iOS plugin

`plugins/ios-fix-rnfirebase.js` (64 lines) is a new Expo config plugin that patches the iOS project to fix a known build-time incompatibility between the new React Native architecture and `@react-native-firebase`. It modifies `Podfile` post-install hooks and sets build flags. This is a workaround for a known upstream issue with RNFirebase on New Architecture.

#### EAS profile changes

| Profile | Change |
|---------|--------|
| `development` | iOS changed from device build to **simulator** build |
| `development-simulator` | Added `RCT_NEW_ARCH_ENABLED=1` env var |
| `preview` | Changed from `internal` to `store` distribution; added full `EXPO_PUBLIC_FIREBASE_*` env vars inline; pinned macOS Sonoma 14.6 + Xcode 16.1 for reproducibility |
| `production` | Added `RCT_NEW_ARCH_ENABLED=1` env var |

Embedding Firebase credentials in `eas.json` is pragmatic for a development team but should be reviewed before the project becomes open source.

#### `firebase.ts` rewritten

`src/services/firebase/firebase.ts` now explicitly calls `firebase.initializeApp(firebaseConfig)` using the `EXPO_PUBLIC_FIREBASE_*` environment variables. The lazy-load pattern (`require('@react-native-firebase/app').default`) was replaced with a direct import. The module exports the `auth` and `firestore` instances directly, and `AuthContext` now uses `auth()` from this module rather than going through the `auth.ts` service wrapper.

### Impact

The build is now tied to specific Firebase environment variables. A developer who does not have the `.env` file or EAS access cannot build a working app. The `preview` profile produces a store-ready build (not internal distribution), which may affect how TestFlight/internal testing is managed.

### Design rationale

The move to `app.config.js` is the recommended Expo pattern for projects that need dynamic configuration. The Firebase credentials in `eas.json` reflect the team's decision to use EAS environment variables as the secret store rather than `.env` files (which are gitignored). The iOS plugin is a pragmatic fix for an upstream issue and should be removed once `@react-native-firebase` resolves the New Architecture compatibility problem officially.

---

## 6. Minor UI and Component Changes

### `Input` component

Added `showPasswordToggle?: boolean` prop that renders an eye/eye-off Ionicons button. Used in login and signup screens.

### `Select` component

New `src/components/ui/Select.tsx` — a modal-based dropdown (96 lines). Uses `Modal` + `ScrollView` to present options in a bottom sheet style. Used in profile editing screens.

### `MomsLikeYouPlaceholder`

A simpler version of the MomsLikeYou carousel for use on the home tab — renders up to 3 random profiles with a "Say Hi" button but without the full connection management logic.

### Default avatar

`assets/default-avatar-profile.jpg` was added as a fallback image. `src/constants/avatars.ts` exports `getAvatarSource(photoURL)` — returns `{ uri: photoURL }` if a URL is present, otherwise the bundled default. This prevents broken image placeholders throughout the app.

### `errorsFilters.ts`

New utility (`src/utils/errorsFilters.ts`) maps Firebase Auth error codes to user-readable Portuguese strings. Used in login and signup screens.

### `MonthYearPicker`

Refactored to use a `Select` dropdown instead of plain `TextInput` fields, improving the mobile UX for month and year selection.

---

## 7. Navigation Guard Improvements

`_layout.tsx` navigation guard was made more robust:

- Added `usePathname()` to check the current path before replacing, preventing redundant navigations
- Added `lastRedirectRef` to prevent rapid repeated redirects to the same route
- Removed the Firebase startup check entirely (see §1)
- Removed RevenueCat initialization and notification deep-link handling (these can be re-added independently)
- `profileCompleted` is now derived from `!!profileSetupCompletedAt` rather than the boolean `completed` field

---

## 8. Open Questions and Risks

| Area | Risk / Question |
|------|----------------|
| Firebase credentials in `eas.json` | `EXPO_PUBLIC_FIREBASE_*` keys are visible to anyone with repo access. Consider moving to EAS Secrets UI |
| No mock mode | Developing offline or without Firebase config will fail. A lightweight mock mode for CI or testing may be needed |
| Missing `socialAuth.ts` | Social login is gone with no replacement planned in the codebase. The PRD requires Instagram/Facebook/LinkedIn login. Confirm if email/password is the final decision |
| Connection write atomicity | `generateConnection` writes two documents with `Promise.all`, not a Firestore transaction. A network failure between the two writes leaves the graph in an inconsistent state |
| `useReferralCode` anonymous auth | Anonymous accounts are created and deleted synchronously. Firebase does not guarantee immediate deletion; leaked anonymous accounts may accumulate |
| EAS project owner change | The project is now under `filipemendonca`'s Expo account. Ensure the original developer has continued access |
| `@react-native-firebase/messaging` added to plugins but not tested | FCM push notifications are wired in `app.config.js` but the notification handlers from `_layout.tsx` were removed. Push notifications are currently non-functional |

---

## 9. Backend Integration Requirements

Based on these frontend changes, the backend (`Raine-bk`) needs to:

| Requirement | Details |
|-------------|---------|
| `connections` collection | Create Firestore collection; document ID = `userId`; structure per `Connection` type in `src/types/connection.ts` |
| Security rules for `connections` | Users can read/write their own document only; read-only access to `connectionDetailsList` for connection UIDs |
| `users.referralCode` field | The signup flow generates a referral code; ensure the Firestore trigger or client code stores this on the `users` document |
| `users.profileSetupCompletedAt` | Now a Firestore Timestamp (not a boolean). Cloud functions and security rules that check completion status need updating |
| Auth trigger for profile creation | `waitForUserProfile` in `AuthContext` calls `getUserProfile` after register. The profile document should be created by an Auth trigger on user creation, not by the client |
| Anonymous auth enabled | Firebase project must have anonymous authentication enabled for the referral code check |
