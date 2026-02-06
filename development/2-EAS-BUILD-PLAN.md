# EAS Build Plan - RaineApp with Firebase

## Overview

This plan guides you through rebuilding RaineApp with EAS Build to include the Firebase native configuration. Since Firebase requires native code integration, we must use EAS Build (not Expo Go) to create custom development builds.

---

## Prerequisites Checklist

Before starting, verify these are complete:

- [x] Firebase project created (`raineapp-backend`)
- [x] `GoogleService-Info.plist` downloaded and placed in `RaineApp/`
- [x] `google-services.json` downloaded and placed in `RaineApp/`
- [x] `app.json` configured with Firebase plugins
- [x] React Native Firebase packages installed
- [x] EAS CLI available
- [ ] Apple Developer Account (for iOS builds)
- [ ] Google Play Console account (for Android production)

---

## Phase 1: Environment Verification

### Step 1.1: Verify Firebase Config Files

Ensure the Firebase config files have the correct bundle ID/package name:

```bash
cd /path/to/Raine/RaineApp

# Check iOS config
grep -A1 "BUNDLE_ID" GoogleService-Info.plist
# Should show: com.raine.app

# Check Android config
grep "package_name" google-services.json
# Should show: com.raine.app
```

### Step 1.2: Verify EAS CLI

```bash
# Check if EAS CLI is installed
eas --version

# If not installed:
npm install -g eas-cli

# Login to EAS
eas login
```

### Step 1.3: Verify EAS Project Link

```bash
cd /path/to/Raine/RaineApp

# Check if project is linked
eas project:info

# If not linked, initialize:
eas init
```

---

## Phase 2: Development Build (Recommended First)

Start with a development build to test Firebase integration before production.

### Step 2.1: Build Development Client for iOS Simulator

**Fastest option for testing on Mac:**

```bash
cd /path/to/Raine/RaineApp

# Build for iOS simulator
eas build --profile development-simulator --platform ios
```

**Expected time:** 10-20 minutes

**After build completes:**
```bash
# Download and install on simulator
eas build:run --platform ios --latest
```

### Step 2.2: Build Development Client for Physical iOS Device

**Requires Apple Developer Account:**

```bash
cd /path/to/Raine/RaineApp

# Build for physical iOS device
eas build --profile development --platform ios
```

**During build, EAS will:**
1. Ask to create/select provisioning profile
2. Ask to create/select distribution certificate
3. Register your device (if needed)

**After build completes:**
- Scan QR code to install on device
- Or download IPA from EAS dashboard

### Step 2.3: Build Development Client for Android

```bash
cd /path/to/Raine/RaineApp

# Build APK for Android
eas build --profile development --platform android
```

**Expected time:** 10-15 minutes

**After build completes:**
```bash
# Download and install on device/emulator
eas build:run --platform android --latest
```

---

## Phase 3: Test Firebase Integration

### Step 3.1: Start Development Server

```bash
cd /path/to/Raine/RaineApp

# Start Expo dev server for custom client
npx expo start --dev-client
```

### Step 3.2: Test Firebase Auth

In your app, test the Firebase Auth trigger:

1. Sign up with a new user
2. Check Firebase Console → Authentication → Users
3. Check Firestore → `users` collection for new document

### Step 3.3: Test Push Notifications (iOS)

For iOS, request notification permissions in the app:

```typescript
import messaging from '@react-native-firebase/messaging';

// Request permission
const authStatus = await messaging().requestPermission();

// Get FCM token
const token = await messaging().getToken();
console.log('FCM Token:', token);
```

### Step 3.4: Verify Cloud Functions

Test that Cloud Functions are accessible:

```typescript
import functions from '@react-native-firebase/functions';

// Call a function
const refreshToken = functions().httpsCallable('refreshFcmToken');
const result = await refreshToken({ token: fcmToken, platform: 'ios' });
```

---

## Phase 4: Preview Build (Internal Testing)

Once development builds work, create preview builds for internal testers.

### Step 4.1: Build Preview for iOS

```bash
cd /path/to/Raine/RaineApp

eas build --profile preview --platform ios
```

### Step 4.2: Build Preview for Android

```bash
cd /path/to/Raine/RaineApp

eas build --profile preview --platform android
```

### Step 4.3: Distribute to Testers

**iOS:** Use TestFlight or Ad-hoc distribution
**Android:** Share APK directly or use internal testing track

---

## Phase 5: Production Build (App Store/Play Store)

### Step 5.1: Update Version Numbers

Edit `app.json`:
```json
{
  "expo": {
    "version": "1.0.0",
    "ios": {
      "buildNumber": "1"
    },
    "android": {
      "versionCode": 1
    }
  }
}
```

### Step 5.2: Build Production for iOS

```bash
cd /path/to/Raine/RaineApp

eas build --profile production --platform ios
```

**This will:**
1. Create an optimized release build
2. Sign with distribution certificate
3. Produce an IPA ready for App Store

### Step 5.3: Build Production for Android

```bash
cd /path/to/Raine/RaineApp

eas build --profile production --platform android
```

**This will:**
1. Create an optimized release build
2. Sign with upload key
3. Produce an AAB (App Bundle) for Play Store

### Step 5.4: Submit to Stores

```bash
# Submit iOS to App Store Connect
eas submit --platform ios

# Submit Android to Google Play
eas submit --platform android
```

---

## Troubleshooting

### Common Issues

#### 1. "GoogleService-Info.plist not found"
```bash
# Verify file exists
ls -la RaineApp/GoogleService-Info.plist

# Check app.json path
# Should be: "googleServicesFile": "./GoogleService-Info.plist"
```

#### 2. "Bundle ID mismatch"
```bash
# iOS bundle ID must match in:
# - GoogleService-Info.plist (BUNDLE_ID)
# - app.json (ios.bundleIdentifier)
# - Firebase Console (iOS app)
```

#### 3. "Firebase App not initialized"
Ensure `@react-native-firebase/app` is the first Firebase plugin in `app.json`:
```json
"plugins": [
  "@react-native-firebase/app",  // Must be first
  "@react-native-firebase/auth",
  // ... other Firebase plugins
]
```

#### 4. "Build failed - provisioning profile"
```bash
# Clear EAS credentials cache
eas credentials --platform ios

# Select "Manage credentials"
# Choose "Remove" for problematic profiles
# Re-run build to regenerate
```

#### 5. "Android build failed - google-services.json"
```bash
# Verify package name matches
grep "package_name" google-services.json
# Must match: "package": "com.raine.app" in app.json
```

---

## Quick Reference Commands

```bash
# Development builds
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile development-simulator --platform ios

# Preview builds
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Production builds
eas build --profile production --platform ios
eas build --profile production --platform android

# Install latest build
eas build:run --platform ios --latest
eas build:run --platform android --latest

# View build status
eas build:list

# View logs
eas build:view
```

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 1: Verification | 5-10 min | Local checks |
| Phase 2: Dev Build | 15-30 min | First build takes longer |
| Phase 3: Testing | 30-60 min | Depends on scope |
| Phase 4: Preview Build | 15-25 min | Per platform |
| Phase 5: Production | 20-30 min | Per platform |

**Total for first complete cycle:** ~2-3 hours

---

## Next Steps After Successful Build

1. ✅ Test user registration flow with Firebase Auth
2. ✅ Verify `onUserCreate` Cloud Function triggers
3. ✅ Test FCM token registration
4. ⏳ Configure RevenueCat webhook (see backlog)
5. ⏳ End-to-end testing (see backlog)
