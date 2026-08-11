/**
 * Enum values mirrored from prisma/schema.prisma.
 *
 * They are re-declared here (rather than imported from @prisma/client) so the
 * Next.js bundle never has to pull in the Prisma runtime. If you change an
 * enum in the schema, change it here too — `npm run check:enums` in the API
 * asserts the two lists match and fails CI if they drift.
 */

export const ROLES = [
  'ADMIN',
  'PRODUCER',
  'MARKETING',
  'FINANCE',
  'PRESENTER',
  'VIEWER',
] as const;
export type Role = (typeof ROLES)[number];

export const PRESENTER_STATUSES = ['ONBOARDING', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type PresenterStatus = (typeof PRESENTER_STATUSES)[number];

export const CONTRACT_STATUSES = ['DRAFT', 'PENDING', 'SIGNED', 'EXPIRED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const RATE_UNITS = [
  'PER_VIDEO',
  'PER_FINISHED_MINUTE',
  'PER_HOUR',
  'PER_HALF_DAY',
  'PER_DAY',
  'PER_PROJECT',
] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const ASSIGNMENT_STATUSES = [
  'DRAFT',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'REVISIONS_REQUESTED',
  'APPROVED',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ATTACHMENT_KINDS = [
  'SCRIPT',
  'BRIEF',
  'REFERENCE',
  'CONTRACT',
  'DELIVERABLE',
  'INVOICE',
  'OTHER',
] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const STORAGE_PROVIDERS = ['S3', 'EXTERNAL_LINK'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const PLATFORMS = [
  'YOUTUBE',
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'LINKEDIN',
  'X',
  'WEBSITE',
  'EMAIL',
  'PAID_ADS',
  'OTHER',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const AVAILABILITY_TYPES = ['UNAVAILABLE', 'LIMITED', 'PREFERRED'] as const;
export type AvailabilityType = (typeof AVAILABILITY_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'ASSIGNMENT_OFFERED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_DECLINED',
  'ASSIGNMENT_DUE_SOON',
  'ASSIGNMENT_OVERDUE',
  'DELIVERY_SUBMITTED',
  'REVISIONS_REQUESTED',
  'APPROVED',
  'FEEDBACK_RECEIVED',
  'COMMENT_MENTION',
  'CONTRACT_EXPIRING',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Human-readable labels. One source of truth so the API, the web app and any
// CSV export all spell things the same way.
// ---------------------------------------------------------------------------

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  DRAFT: 'Draft',
  ASSIGNED: 'Awaiting response',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  REVISIONS_REQUESTED: 'Revisions requested',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
};

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  PER_VIDEO: 'per video',
  PER_FINISHED_MINUTE: 'per finished minute',
  PER_HOUR: 'per hour',
  PER_HALF_DAY: 'per half day',
  PER_DAY: 'per day',
  PER_PROJECT: 'per project (flat)',
};

export const RATE_UNIT_QUANTITY_LABEL: Record<RateUnit, string> = {
  PER_VIDEO: 'videos',
  PER_FINISHED_MINUTE: 'finished minutes',
  PER_HOUR: 'hours',
  PER_HALF_DAY: 'half days',
  PER_DAY: 'days',
  PER_PROJECT: 'projects',
};

export const PRESENTER_STATUS_LABEL: Record<PresenterStatus, string> = {
  ONBOARDING: 'Onboarding',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  PRODUCER: 'Producer',
  MARKETING: 'Marketing',
  FINANCE: 'Finance',
  PRESENTER: 'Presenter',
  VIEWER: 'Viewer',
};

/**
 * Statuses that mean "this assignment is currently occupying the presenter".
 * Used by the workload view and by the "is this person free?" check.
 */
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'REVISIONS_REQUESTED',
];

/** Statuses that mean the work is finished and countable for reporting. */
export const DELIVERED_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['APPROVED', 'COMPLETED'];

/** Statuses no further transition can leave. */
export const TERMINAL_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
];
