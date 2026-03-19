/**
 * Raine Backend - TypeScript Type Definitions
 *
 * Aligned with RaineApp frontend after connections refactor (Phase 3 complete).
 * Legacy room-based types have been removed.
 */

import {FieldValue, Timestamp} from "firebase-admin/firestore";

// ============================================================================
// User Types
// ============================================================================

export interface NotificationPreferences {
  enabled: boolean;
  quietHoursStart?: string | null; // "HH:MM" format
  quietHoursEnd?: string | null; // "HH:MM" format
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan?: string;
  subscriptionStartedAt?: Timestamp;
  subscriptionUpdatedAt?: Timestamp;
  subscriptionCancelledAt?: Timestamp;
  subscriptionExpiredAt?: Timestamp;
  notificationPreferences: NotificationPreferences;
  suspended?: boolean;
  suspendedAt?: Timestamp;
  suspendReason?: string;
  createdAt: Timestamp | FieldValue;
  lastSeen?: Timestamp | FieldValue;
  referralCode?: string;
  role?: "admin" | "user"; // Custom claim for backoffice access; undefined = 'user'
}

export type SubscriptionStatus =
  | "free"
  | "active"
  | "cancelled"
  | "expired"
  | "billing_issue";

// ============================================================================
// Connection Types
// ============================================================================

export interface ConnectionUser {
  uid: string;
  firstName: string;
  lastInitial: string;
  photoURL: string | null;
}

export type ConnectionStatus = "pending" | "active" | "dismissed" | "canceled";

export interface ConnectionLastMessage {
  text: string;
  senderId: string;
  timestamp: Timestamp | FieldValue;
}

export interface Connection {
  id: string;
  fromUser: ConnectionUser;
  toUser: ConnectionUser;
  memberUids: [string, string];
  status: ConnectionStatus;
  introductionId: string | null;
  lastMessage: ConnectionLastMessage | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  acceptedAt: Timestamp | null;
}

// ============================================================================
// Introduction Types (Phase 1+)
// ============================================================================

export interface IntroductionUser {
  uid: string;
  firstName: string;
  lastInitial: string;
  photoURL: string | null;
  city: string;
  state: string;
  action: "none" | "saved" | "requested" | "dismissed";
}

export interface MatchDetails {
  similarities: string[];
  customText: string;
  matchScore: number | null;
}

export type IntroductionStatus =
  | "active"
  | "requested"
  | "accepted"
  | "dismissed"
  | "expired";

export interface Introduction {
  id: string;
  users: [IntroductionUser, IntroductionUser];
  userUids: [string, string];
  matchDetails: MatchDetails;
  status: IntroductionStatus;
  connectionId: string | null;
  requestedByUid: string | null;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | null;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// Device Types
// ============================================================================

export interface Device {
  fcmToken: string;
  platform: "ios" | "android" | "unknown";
  lastActive: Timestamp | FieldValue;
  appVersion?: string;
}

export interface DeviceToken {
  token: string;
  userId: string;
  deviceId: string;
  platform: "ios" | "android" | "unknown";
}

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  senderId: string;
  text: string;
  timestamp: Timestamp | FieldValue;
  reactions?: Record<string, string[]>;
  deleted: boolean;
  deletedAt?: Timestamp | FieldValue;
  deletedBy?: string;
  editedAt?: Timestamp | FieldValue;
  flagged?: boolean;
  visible?: boolean;
}

export interface MessagePayload {
  text: string;
  senderId: string;
  timestamp: Timestamp | FieldValue;
}

// ============================================================================
// Typing Indicator Types (for connections/{connectionId}/typing/{userId})
// ============================================================================

export interface ConnectionTypingIndicator {
  isTyping: boolean;
  updatedAt: Timestamp | FieldValue;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  userId: string;
  type: NotificationType;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: Timestamp | FieldValue;
}

export type NotificationType =
  | "new_message"
  | "billing_issue"
  | "subscription_expired"
  | "user_report"
  | "system";

// ============================================================================
// Idempotency Types
// ============================================================================

export interface ProcessedEvent {
  processedAt: Timestamp | FieldValue;
  functionName: string;
}

export interface ProcessedWebhook {
  processedAt: Timestamp | FieldValue;
  eventType: string;
  userId?: string;
}

// ============================================================================
// Retry Queue Types
// ============================================================================

export interface NotificationRetry {
  connectionId: string;
  messageId: string;
  message: MessagePayload;
  error: string;
  createdAt: Timestamp | FieldValue;
  retryCount: number;
  lastError?: string;
  lastRetryAt?: Timestamp | FieldValue;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitRecord {
  timestamps: number[];
  lastUpdated: Timestamp | FieldValue;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================================================
// User Report Types
// ============================================================================

export interface UserReport {
  reporterId: string;
  reportedUserId: string;
  reason: string;
  description?: string;
  messageId?: string;
  connectionId?: string;
  status: "pending" | "reviewed" | "dismissed";
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// RevenueCat Webhook Types
// ============================================================================

export interface RevenueCatWebhookEvent {
  id: string;
  type: RevenueCatEventType;
  app_user_id: string;
  product_id?: string;
  // Additional fields from RevenueCat
  [key: string]: unknown;
}

export type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "TEST";

export interface RevenueCatWebhookPayload {
  event: RevenueCatWebhookEvent;
}

// ============================================================================
// Profile Setup (for generateProfileBio callable)
// ============================================================================

export interface ProfileSetupInput {
  firstName?: string;
  city?: string;
  state?: string;
  childCount?: number;
  children?: Array<{ name: string; birthMonth: number; birthYear: number }>;
  isExpecting?: boolean;
  cityFeel?: string | null;
  beforeMotherhood?: string[];
  perfectWeekend?: string[];
  feelYourself?: string | null;
  hardTruths?: string[];
  unexpectedJoys?: string[];
  aesthetic?: string[];
  momFriendStyle?: string[];
  whatBroughtYou?: string | null;
}
