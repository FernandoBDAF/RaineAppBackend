# Raine Backend Setup Manual

This document contains all the **manual steps** that must be completed by a human. The LLM will generate all code files, but cloud setup, CLI commands, and deployments must be done manually.

---

## Project Information

| Item | Value |
|------|-------|
| **Firebase Project ID** | `raineapp-backend` |
| **iOS Bundle ID** | `com.raine.app` |
| **Android Package** | `com.raine.app` |
| **Frontend App** | `RaineApp/` (Expo + React Native Firebase) |
| **Backend** | `Raine-bk/` (Firebase Cloud Functions) |

---

## Table of Contents

1. [Prerequisites](#step-1-prerequisites)
2. [Firebase Project Setup (Console)](#step-2-firebase-project-setup-console)
3. [React Native Firebase Setup](#step-3-react-native-firebase-setup)
4. [Backend Local Environment Setup](#step-4-backend-local-environment-setup)
5. [Install Dependencies](#step-5-install-dependencies)
6. [Configure Secrets](#step-6-configure-secrets)
7. [Testing with Emulators](#step-7-testing-with-emulators)
8. [Deployment](#step-8-deployment)
9. [RevenueCat Webhook Configuration](#step-9-revenuecat-webhook-configuration)
10. [Post-Deployment Verification](#step-10-post-deployment-verification)

---

## Step 1: Prerequisites

### Required Software

Install the following before proceeding:

1. **Node.js** (v18 or later)
   ```bash
   # Check version
   node --version
   
   # Install via homebrew (macOS)
   brew install node@18
   ```

2. **Firebase CLI**
   ```bash
   # Install globally
   npm install -g firebase-tools
   
   # Verify installation
   firebase --version
   ```

3. **Google Cloud SDK** (optional, for advanced operations)
   ```bash
   # macOS
   brew install --cask google-cloud-sdk
   ```

### Firebase Account

- Go to [Firebase Console](https://console.firebase.google.com)
- Sign in with your Google account
- Ensure you have billing enabled (credit card required for Blaze plan)

---

## Step 2: Firebase Project Setup (Console)

> **Status**: ✅ COMPLETED
> 
> Project `raineapp-backend` has been created with Blaze plan, Firestore, and Storage enabled.

### 2.1 Create Firebase Project ✅

- Project created: `raineapp-backend`
- Google Analytics: Enabled

### 2.2 Upgrade to Blaze Plan ✅

Cloud Functions require the Blaze (pay-as-you-go) plan - completed.

### 2.3 Enable Firebase Services

#### Authentication - Social Providers (TODO)
Social login providers need additional setup:

**Facebook Login:**
1. Go to **Build** → **Authentication** → **Sign-in method**
2. Enable **Facebook**
3. You'll need to create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
4. Get App ID and App Secret from Facebook
5. Add OAuth redirect URI to Facebook app settings

**Instagram Login:**
- Instagram uses Facebook Login (same Facebook App)
- Users authenticate via Facebook's Instagram Basic Display API

**LinkedIn Login:**
- Firebase doesn't have native LinkedIn support
- Options:
  - Use **OpenID Connect** custom provider
  - Handle LinkedIn OAuth in Cloud Functions and create Firebase custom tokens

> **Note**: Social auth setup is a separate task. The backend can be deployed first.

#### Cloud Firestore ✅
- Database created in production mode
- Location: Check Firebase Console for region

#### Cloud Storage ✅
- Storage enabled

#### Cloud Functions
1. Go to **Build** → **Functions**
2. Click **"Get started"** if not already done
3. Functions will be deployed from `Raine-bk/functions/`

### 2.4 Firebase Apps Created ✅

Three apps have been registered:

**iOS App:**
- Bundle ID: `com.raine.app`
- Config file: `RaineApp/GoogleService-Info.plist`

**Android App:**
- Package: `com.raine.app`
- Config file: `RaineApp/google-services.json`

**Web App:**
- Config captured below

### 2.5 Firebase Configuration

**Project ID:** `raineapp-backend`

**Web Config (for reference):**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBQgUkoEXgQHwRRfqMAY3JJguu_xwzX3Y4",
  authDomain: "raineapp-backend.firebaseapp.com",
  projectId: "raineapp-backend",
  storageBucket: "raineapp-backend.firebasestorage.app",
  messagingSenderId: "358132660024",
  appId: "1:358132660024:web:7db9ada17b2fc4524633cd",
  measurementId: "G-NPJ83PPQQS"
};
```
(This is wrong, the region is on the west)
**Webhook URL (after deployment):**
```
https://us-central1-raineapp-backend.cloudfunctions.net/revenuecatWebhook
```

---

## Step 3: React Native Firebase Setup

> **Status**: ✅ COMPLETED (by LLM)

The Expo app has been configured to use React Native Firebase.

### 3.1 Config Files Location ✅

The Firebase config files are in the `RaineApp/` directory:

```
RaineApp/
├── GoogleService-Info.plist    # iOS config
├── google-services.json        # Android config
└── app.json                    # Expo config with Firebase plugins
```

### 3.2 Expo Plugins Configured ✅

The following plugins have been added to `app.json`:

```json
{
  "expo": {
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      "@react-native-firebase/firestore",
      "@react-native-firebase/functions",
      "@react-native-firebase/storage",
      "@react-native-firebase/messaging",
      "@react-native-firebase/crashlytics",
      "@react-native-firebase/analytics",
      "@react-native-firebase/remote-config"
    ]
  }
}
```

### 3.3 Rebuild Required After Changes

After any changes to Firebase config, rebuild the app:

```bash
cd RaineApp

# For development builds
eas build --profile development --platform ios
eas build --profile development --platform android

# Or for local development with Expo dev client
npx expo prebuild --clean
npx expo run:ios  # or run:android
```

> **Note**: Changes to `app.json` plugins require a new native build. Hot reload won't pick up these changes.

### 3.4 Firebase SDK Packages ✅

Already installed in `RaineApp/package.json`:
- `@react-native-firebase/app`
- `@react-native-firebase/auth`
- `@react-native-firebase/firestore`
- `@react-native-firebase/functions`
- `@react-native-firebase/storage`
- `@react-native-firebase/messaging`
- `@react-native-firebase/crashlytics`
- `@react-native-firebase/analytics`
- `@react-native-firebase/remote-config`

---

## Step 4: Backend Local Environment Setup

### 4.1 Login to Firebase CLI

```bash
# Login to Firebase (opens browser)
firebase login

# Verify login
firebase projects:list
```

You should see `raineapp-backend` in the list.

### 4.2 Create Project Directory Structure

Navigate to the Raine-bk directory and create the folder structure:

```bash
cd /path/to/Raine/Raine-bk

# Create directory structure
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

### 4.3 Initialize Firebase in the Directory

```bash
cd /path/to/Raine/Raine-bk

# Initialize Firebase (select your project)
firebase init
```

When prompted, select:
- **Features**: 
  - ✅ Firestore
  - ✅ Functions
  - ✅ Storage
  - ✅ Emulators
- **Project**: Use existing project → select `raineapp-backend`
- **Firestore Rules**: `firestore/firestore.rules`
- **Firestore Indexes**: `firestore/firestore.indexes.json`
- **Functions language**: TypeScript
- **ESLint**: Yes (recommended)
- **Install dependencies**: No (we'll do this after LLM generates package.json)
- **Storage Rules**: `storage/storage.rules`
- **Emulators**: Select Auth, Functions, Firestore, Storage

> **Important**: If `firebase init` creates default files, the LLM will overwrite them with the correct content.

---

## Step 5: Install Dependencies

**Run this AFTER the LLM has generated all code files.**

```bash
cd /path/to/Raine/Raine-bk/functions

# Install dependencies
npm install

# Verify TypeScript compiles
npm run build
```

If you encounter errors:
- Check that all source files were created
- Ensure `tsconfig.json` is correct
- Run `npm run build` to see specific TypeScript errors

---

## Step 6: Configure Secrets

Firebase Functions now uses **Google Secret Manager** for secrets (the old `functions:config` is deprecated).

### 6.1 RevenueCat Webhook Token

Generate a secure random token for RevenueCat webhook authentication:

```bash
# Generate a random token (copy the output - save this for RevenueCat dashboard later!)
openssl rand -base64 32
```

Create the secret in Google Secret Manager:

```bash
cd /path/to/Raine/Raine-bk

# Create the secret (you'll be prompted to enter the value)
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET

# When prompted, paste the token you generated above
```

Verify the secret was created:

```bash
# List all secrets
firebase functions:secrets:access REVENUECAT_WEBHOOK_SECRET
```

### 6.2 For Local Emulator Testing

Create a `.secret.local` file for the emulator:

```bash
cd /path/to/Raine/Raine-bk/functions

# Create secrets file for local testing
echo "REVENUECAT_WEBHOOK_SECRET=your_test_token_here" > .secret.local
```

> **Important**: Add `.secret.local` to `.gitignore` - it contains secrets!

Alternatively, you can set environment variables before running the emulator:

```bash
export REVENUECAT_WEBHOOK_SECRET="your_test_token_here"
firebase emulators:start
```

---

## Step 7: Testing with Emulators

### 7.1 Start Emulators

```bash
cd /path/to/Raine/Raine-bk

# Start all emulators
firebase emulators:start
```

The emulator UI will be available at: http://localhost:4000

### 7.2 Test Scenarios

Open the Emulator UI and test:

1. **Authentication**
   - Create a test user in the Auth emulator
   - Verify `onUserCreate` trigger fires
   - Check Firestore for the created user document

2. **Messaging**
   - Create a room document in Firestore emulator
   - Add a member document
   - Create a message document
   - Verify `onMessageCreated` trigger fires
   - Check that `lastMessage` is updated on the room

3. **Webhook** (manual test)
   ```bash
   # Test RevenueCat webhook endpoint
   curl -X POST http://localhost:5001/raineapp-backend/us-central1/revenuecatWebhook \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
     -d '{"event": {"id": "test-123", "type": "INITIAL_PURCHASE", "app_user_id": "user123"}}'
   ```

4. **Security Rules**
   - Try to read/write documents as unauthenticated user (should fail)
   - Try to read another user's data (should fail)
   - Test membership-based access to rooms

### 7.3 View Logs

Watch function logs in the terminal where emulators are running, or use:

```bash
# In another terminal
firebase emulators:start --inspect-functions
```

---

## Step 8: Deployment

### 8.1 Build Functions

```bash
cd /path/to/Raine/Raine-bk/functions

# Build TypeScript
npm run build
```

### 8.2 Deploy Everything

```bash
cd /path/to/Raine/Raine-bk

# Deploy all resources
firebase deploy --project raineapp-backend
```

Or deploy individually:

```bash
# Deploy only Firestore rules
firebase deploy --only firestore:rules --project raineapp-backend

# Deploy only Firestore indexes
firebase deploy --only firestore:indexes --project raineapp-backend

# Deploy only Cloud Functions
firebase deploy --only functions --project raineapp-backend

# Deploy only Storage rules
firebase deploy --only storage --project raineapp-backend
```

### 8.3 Verify Deployment

After deployment, verify in Firebase Console:

1. **Functions**: Go to Functions dashboard, verify all functions are listed
2. **Firestore**: Check Rules tab shows deployed rules
3. **Storage**: Check Rules tab shows deployed rules

---

## Step 9: RevenueCat Webhook Configuration

### 9.1 Get Your Webhook URL

After deploying functions, your webhook URL is:

```
https://us-central1-raineapp-backend.cloudfunctions.net/revenuecatWebhook
```

### 9.2 Configure in RevenueCat Dashboard

1. Go to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Select your project
3. Go to **Project Settings** → **Integrations** → **Webhooks**
4. Click **"+ New"**
5. Configure:
   - **URL**: `https://us-central1-raineapp-backend.cloudfunctions.net/revenuecatWebhook`
   - **Authorization header**: `Bearer YOUR_WEBHOOK_TOKEN` (the token you generated in Step 6.1)
6. Select events to receive:
   - ✅ INITIAL_PURCHASE
   - ✅ RENEWAL
   - ✅ CANCELLATION
   - ✅ EXPIRATION
   - ✅ BILLING_ISSUE
   - ✅ PRODUCT_CHANGE
7. Click **"Save"**

### 9.3 Test Webhook

Use RevenueCat's "Send test webhook" feature to verify the connection.

---

## Step 10: Post-Deployment Verification

### 10.1 Test Authentication Flow

1. Use your frontend app to sign up a new user
2. Check Firestore for the created user document at `/users/{userId}`
3. Verify fields: `uid`, `email`, `displayName`, `subscriptionStatus: "free"`

### 10.2 Test Messaging Flow

1. Create a room and add members (via frontend or Firestore console)
2. Send a message to the room
3. Verify:
   - Room's `lastMessage` field is updated
   - Push notifications are sent (check function logs)

### 10.3 Monitor Function Logs

```bash
# Stream logs from deployed functions
firebase functions:log --project raineapp-backend
```

Or view in Firebase Console → Functions → Logs tab.

### 10.4 Set Up Monitoring (Recommended)

1. Go to **Google Cloud Console** → **Monitoring**
2. Create alerts for:
   - Function error rate > 1%
   - Function execution time > 10s
   - Firestore read/write quota warnings

---

## Troubleshooting

### Common Issues

#### "Permission denied" errors
- Verify you're logged in: `firebase login`
- Check you selected the correct project: `firebase use raineapp-backend`
- Ensure Blaze plan is active

#### Functions not deploying
- Check `npm run build` succeeds without errors
- Verify `functions/lib/` directory exists after build
- Check Node.js version matches `engines` in package.json

#### Webhook not receiving events
- Verify webhook URL is correct
- Check Authorization header matches your token exactly
- Look at function logs for errors

#### Emulator issues
- Ensure ports 4000, 5001, 8080, 9099 are available
- Try `firebase emulators:start --only functions,firestore`

### Getting Help

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Cloud Functions Guides](https://firebase.google.com/docs/functions)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

---

## Quick Reference Commands

```bash
# Login
firebase login

# Select project
firebase use raineapp-backend

# View current project
firebase projects:list

# Start emulators
firebase emulators:start

# Deploy everything
firebase deploy --project raineapp-backend

# Deploy specific target
firebase deploy --only functions --project raineapp-backend
firebase deploy --only firestore:rules --project raineapp-backend
firebase deploy --only firestore:indexes --project raineapp-backend
firebase deploy --only storage --project raineapp-backend

# View function logs
firebase functions:log --project raineapp-backend

# Set config values
firebase functions:config:set key="value" --project raineapp-backend

# Get config values
firebase functions:config:get --project raineapp-backend

# Build functions
cd functions && npm run build
```

---

## Checklist Before LLM Execution

### Firebase Console (Step 2) ✅
- [x] Firebase project created (`raineapp-backend`)
- [x] Upgraded to Blaze plan
- [x] Firestore database created
- [x] Cloud Storage enabled
- [ ] Authentication: Social providers configured (Facebook, Instagram, LinkedIn) - *can be done later*

### React Native Firebase (Step 3) ✅
- [x] `GoogleService-Info.plist` in `RaineApp/` (iOS)
- [x] `google-services.json` in `RaineApp/` (Android)
- [x] `app.json` updated with Firebase plugins

### Backend Setup (Step 4) - TODO
- [ ] Firebase CLI installed and logged in
- [ ] Directory structure created in `Raine-bk/`
- [ ] `firebase init` completed in `Raine-bk/`

## Checklist After LLM Execution

- [ ] `npm install` run in `Raine-bk/functions/` directory
- [ ] `npm run build` succeeds
- [ ] Secrets configured via `firebase functions:config:set`
- [ ] `.runtimeconfig.json` created for emulator
- [ ] Emulator tests pass
- [ ] Deployed to Firebase
- [ ] RevenueCat webhook configured
- [ ] End-to-end test completed
- [ ] Rebuild RaineApp with EAS (`eas build`)
