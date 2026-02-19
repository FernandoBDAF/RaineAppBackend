/**
 * Raine Backend - TypeScript Type Definitions
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
  firstName: string;
  lastInitial: string;
  zipCode: string;
  city: string;
  state: string;
  county: string;
  cityFeel: string;
  childCount: number;
  isExpecting: boolean;
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
  profileSetupCompleted: false
}

export type SubscriptionStatus =
  | "free"
  | "active"
  | "cancelled"
  | "expired"
  | "billing_issue";

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
// Room Types
// ============================================================================

export interface Room {
  name: string;
  photoURL?: string;
  memberCount: number;
  lastMessage?: LastMessage;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface LastMessage {
  text: string;
  senderId: string;
  timestamp: Timestamp | FieldValue;
}

export interface RoomMember {
  joinedAt: Timestamp | FieldValue;
  role: "admin" | "member";
  notificationsEnabled: boolean;
}

export interface RoomMembership {
  joinedAt: Timestamp | FieldValue;
  lastRead?: Timestamp | FieldValue;
  notificationsEnabled: boolean;
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

export interface ReadReceipt {
  timestamp: Timestamp | FieldValue;
}

// ============================================================================
// Typing Indicator Types
// ============================================================================

export interface TypingIndicator {
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
  roomId: string;
  messageId: string;
  message: {
    text: string;
    senderId: string;
    timestamp: Timestamp | FieldValue;
  };
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
  roomId?: string;
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
