import { z } from 'zod';
import {
  ASSIGNMENT_STATUSES,
  ATTACHMENT_KINDS,
  AVAILABILITY_TYPES,
  CONTRACT_STATUSES,
  PLATFORMS,
  PRESENTER_STATUSES,
  PRIORITIES,
  RATE_UNITS,
  ROLES,
} from '../enums';

/**
 * Zod schemas are the single definition of every request payload.
 *
 *  - the API validates against them with a global ZodValidationPipe
 *  - the web app validates the same object in the form via @hookform/resolvers
 *  - the OpenAPI document is generated from them
 *
 * One definition, three consumers. A field can never be optional on the client
 * and required on the server.
 */

const cuid = z.string().min(1);
const isoDate = z.string().datetime({ offset: true });
const currency = z.string().length(3).toUpperCase();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(ROLES),
  presenterId: cuid.optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10, 'Use at least 10 characters'),
  name: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Brands + taxonomy (free-text create)
// ---------------------------------------------------------------------------

export const upsertBrandSchema = z.object({
  name: z.string().min(1).max(80),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour, e.g. #2563EB')
    .optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});
export type UpsertBrandInput = z.infer<typeof upsertBrandSchema>;

export const upsertWorkTypeSchema = z.object({
  name: z.string().min(1).max(80),
  defaultEstimatedHours: z.number().min(0).max(500).optional(),
  defaultTurnaroundDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
});

/**
 * The payload the brand / tag / work-type combobox sends. Either an existing
 * id, or a name to create on the fly. This is what makes "just type the
 * website" work without a dropdown that has to be maintained.
 */
export const nameOrIdSchema = z.union([
  z.object({ id: cuid }),
  z.object({ name: z.string().min(1).max(80) }),
]);
export type NameOrId = z.infer<typeof nameOrIdSchema>;

// ---------------------------------------------------------------------------
// Presenters
// ---------------------------------------------------------------------------

export const presenterContractSchema = z.object({
  brand: nameOrIdSchema,
  contractStatus: z.enum(CONTRACT_STATUSES).default('PENDING'),
  contractSignedAt: isoDate.nullable().optional(),
  contractExpiresAt: isoDate.nullable().optional(),
  /** Rate as typed, in major units ("250" or "250.50"). Converted server-side. */
  rate: z.string().or(z.number()).nullable().optional(),
  rateUnit: z.enum(RATE_UNITS).nullable().optional(),
  currency: currency.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type PresenterContractInput = z.infer<typeof presenterContractSchema>;

export const createPresenterSchema = z.object({
  fullName: z.string().min(1, 'Name is required').max(120),
  displayName: z.string().max(120).optional(),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().max(40).optional().or(z.literal('')),
  photoUrl: z.string().url().nullable().optional(),
  bio: z.string().max(4000).optional(),
  location: z.string().max(120).optional(),
  timezone: z.string().max(64).default('Europe/London'),
  status: z.enum(PRESENTER_STATUSES).default('ONBOARDING'),

  defaultRate: z.string().or(z.number()).nullable().optional(),
  defaultRateUnit: z.enum(RATE_UNITS).default('PER_VIDEO'),
  defaultCurrency: currency.default('GBP'),

  targetDeliverablesPerMonth: z.number().int().min(0).max(500).nullable().optional(),
  capacityWeight: z.number().min(0.1).max(5).default(1),

  supplierRef: z.string().max(64).optional(),
  internalNotes: z.string().max(8000).optional(),

  /** Free-text skill tags — created if they do not exist. */
  tags: z.array(nameOrIdSchema).default([]),
  /** The websites/brands they have contracts to. */
  contracts: z.array(presenterContractSchema).default([]),
});
export type CreatePresenterInput = z.infer<typeof createPresenterSchema>;

export const updatePresenterSchema = createPresenterSchema.partial();
export type UpdatePresenterInput = z.infer<typeof updatePresenterSchema>;

export const presenterQuerySchema = z.object({
  q: z.string().optional(),
  status: z.array(z.enum(PRESENTER_STATUSES)).optional(),
  brandId: z.array(cuid).optional(),
  tagId: z.array(cuid).optional(),
  /** Only presenters with no assignment in the last N days. */
  coldForDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: z
    .enum([
      'name',
      'lastAssignedAt',
      'completedAssignments',
      'avgRating',
      'avgTurnaroundMinutes',
      'createdAt',
    ])
    .default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PresenterQuery = z.infer<typeof presenterQuerySchema>;

export const availabilitySchema = z.object({
  type: z.enum(AVAILABILITY_TYPES).default('UNAVAILABLE'),
  startDate: z.string(),
  endDate: z.string(),
  note: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const createAssignmentSchema = z
  .object({
    title: z.string().min(1, 'Give the job a title').max(200),
    description: z.string().max(20000).optional(),
    brand: nameOrIdSchema,
    presenterId: cuid.nullable().optional(),
    workType: nameOrIdSchema.nullable().optional(),
    priority: z.enum(PRIORITIES).default('NORMAL'),
    deliverableCount: z.number().int().min(1).max(200).default(1),

    /** Fee as typed, major units. Defaults from the rate card if omitted. */
    fee: z.string().or(z.number()).nullable().optional(),
    feeUnit: z.enum(RATE_UNITS).nullable().optional(),
    feeQuantity: z.number().min(0.01).max(1000).default(1),
    feeCurrency: currency.default('GBP'),

    estimatedHours: z.number().min(0).max(500).nullable().optional(),
    dueAt: isoDate.nullable().optional(),

    /** Send it straight away instead of leaving it as a draft. */
    sendImmediately: z.boolean().default(false),
  })
  .refine((v) => !v.sendImmediately || Boolean(v.presenterId), {
    message: 'Choose a presenter before sending',
    path: ['presenterId'],
  })
  .refine((v) => !v.sendImmediately || Boolean(v.dueAt), {
    message: 'Set a due date before sending',
    path: ['dueAt'],
  });
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(20000).nullable().optional(),
  presenterId: cuid.nullable().optional(),
  workType: nameOrIdSchema.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  deliverableCount: z.number().int().min(1).max(200).optional(),
  fee: z.string().or(z.number()).nullable().optional(),
  feeUnit: z.enum(RATE_UNITS).nullable().optional(),
  feeQuantity: z.number().min(0.01).max(1000).optional(),
  feeCurrency: currency.optional(),
  estimatedHours: z.number().min(0).max(500).nullable().optional(),
  dueAt: isoDate.nullable().optional(),
  deliveryUrl: z.string().url().nullable().optional(),
  deliveryNotes: z.string().max(4000).nullable().optional(),
});

export const transitionAssignmentSchema = z.object({
  to: z.enum(ASSIGNMENT_STATUSES),
  /** Required when moving to SUBMITTED if not already set. */
  deliveryUrl: z.string().url().optional(),
  /** Recorded on the timeline; required for REVISIONS_REQUESTED and DECLINED. */
  note: z.string().max(4000).optional(),
});

export const assignmentQuerySchema = z.object({
  q: z.string().optional(),
  status: z.array(z.enum(ASSIGNMENT_STATUSES)).optional(),
  brandId: z.array(cuid).optional(),
  presenterId: z.array(cuid).optional(),
  workTypeId: z.array(cuid).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional(),
  unassignedOnly: z.coerce.boolean().optional(),
  sort: z
    .enum(['dueAt', 'createdAt', 'assignedAt', 'reference', 'priority', 'turnaroundMinutes'])
    .default('dueAt'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AssignmentQuery = z.infer<typeof assignmentQuerySchema>;

export const commentSchema = z.object({
  body: z.string().min(1).max(8000),
  isInternal: z.boolean().default(false),
});

export const timeLogSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  workedOn: z.string(),
  note: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const presignUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().min(1).max(100 * 1024 * 1024, 'Files are limited to 100 MB'),
  kind: z.enum(ATTACHMENT_KINDS).default('SCRIPT'),
  assignmentId: cuid.optional(),
  presenterBrandId: cuid.optional(),
});

export const confirmUploadSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  kind: z.enum(ATTACHMENT_KINDS).default('SCRIPT'),
  assignmentId: cuid.optional(),
  presenterBrandId: cuid.optional(),
  /** Supply to create v2/v3 of an existing script rather than a new file. */
  versionGroupId: z.string().optional(),
  visibleToPresenter: z.boolean().default(true),
});

export const linkAttachmentSchema = z.object({
  externalUrl: z.string().url('Paste the full OneDrive or SharePoint link'),
  fileName: z.string().min(1).max(255),
  kind: z.enum(ATTACHMENT_KINDS).default('DELIVERABLE'),
  assignmentId: cuid.optional(),
  presenterBrandId: cuid.optional(),
  visibleToPresenter: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Feedback + performance
// ---------------------------------------------------------------------------

const rating = z.number().int().min(1).max(5);

export const feedbackSchema = z.object({
  overallRating: rating,
  deliveryRating: rating.nullable().optional(),
  scriptAccuracy: rating.nullable().optional(),
  professionalism: rating.nullable().optional(),
  timeliness: rating.nullable().optional(),
  productionQuality: rating.nullable().optional(),
  comment: z.string().max(8000).optional(),
  visibleToPresenter: z.boolean().default(false),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const performanceSchema = z.object({
  platform: z.enum(PLATFORMS),
  contentUrl: z.string().url().nullable().optional(),
  publishedAt: isoDate.nullable().optional(),
  measuredOn: z.string(),

  impressions: z.number().int().min(0).nullable().optional(),
  views: z.number().int().min(0).nullable().optional(),
  uniqueViewers: z.number().int().min(0).nullable().optional(),
  watchTimeMinutes: z.number().int().min(0).nullable().optional(),
  avgViewDurationSeconds: z.number().int().min(0).nullable().optional(),
  likes: z.number().int().min(0).nullable().optional(),
  comments: z.number().int().min(0).nullable().optional(),
  shares: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  leads: z.number().int().min(0).nullable().optional(),
  conversions: z.number().int().min(0).nullable().optional(),

  spend: z.string().or(z.number()).nullable().optional(),
  revenue: z.string().or(z.number()).nullable().optional(),
  currency: currency.default('GBP'),
  notes: z.string().max(4000).optional(),
});
export type PerformanceInputPayload = z.infer<typeof performanceSchema>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const workloadQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  brandId: z.array(cuid).optional(),
  /** Include ONBOARDING/PAUSED presenters in the pool. Default: ACTIVE only. */
  includeInactive: z.coerce.boolean().default(false),
});

export const suggestPresentersSchema = z.object({
  brandId: cuid,
  workTypeId: cuid.optional(),
  dueAt: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ---------------------------------------------------------------------------
// AI (optional module)
// ---------------------------------------------------------------------------

export const aiBriefFromScriptSchema = z.object({
  assignmentId: cuid,
  attachmentId: cuid,
});

export const aiSummariseFeedbackSchema = z.object({
  presenterId: cuid,
  months: z.coerce.number().int().min(1).max(36).default(12),
});
