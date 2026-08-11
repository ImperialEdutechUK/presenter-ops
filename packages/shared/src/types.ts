import type {
  AssignmentStatus,
  AttachmentKind,
  AvailabilityType,
  ContractStatus,
  Platform,
  PresenterStatus,
  Priority,
  RateUnit,
  Role,
  StorageProvider,
} from './enums';

/**
 * API response shapes. These are what the web app consumes; they are NOT the
 * Prisma models. Anything the presenter portal must never see (internalNotes,
 * internal comments, unshared feedback) is absent from the DTO the API returns
 * to a PRESENTER-role caller — filtering happens in the service, not the client.
 */

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  /** Field-level messages keyed by dotted path, produced by the Zod pipe. */
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  timezone: string;
  presenterId: string | null;
}

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  colorHex: string;
  websiteUrl: string | null;
  isActive: boolean;
  presenterCount?: number;
  activeAssignmentCount?: number;
}

export interface WorkTypeDto {
  id: string;
  name: string;
  slug: string;
  defaultEstimatedHours: number | null;
  defaultTurnaroundDays: number | null;
  isActive: boolean;
}

export interface TagDto {
  id: string;
  name: string;
  slug: string;
}

export interface PresenterContractDto {
  id: string;
  brand: BrandDto;
  contractStatus: ContractStatus;
  contractSignedAt: string | null;
  contractExpiresAt: string | null;
  /** Effective rate: the brand override if set, otherwise the presenter default. */
  effectiveRateMinor: number | null;
  effectiveRateUnit: RateUnit;
  effectiveCurrency: string;
  /** True when the rate above came from the presenter default, not an override. */
  rateIsInherited: boolean;
  notes: string | null;
  contractFile: AttachmentDto | null;
}

export interface PresenterSummaryDto {
  id: string;
  displayName: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  status: PresenterStatus;
  brands: Pick<BrandDto, 'id' | 'name' | 'colorHex'>[];
  tags: TagDto[];
  defaultRateMinor: number | null;
  defaultRateUnit: RateUnit;
  defaultCurrency: string;
  activeAssignments: number;
  completedAssignments: number;
  lastAssignedAt: string | null;
  avgTurnaroundMinutes: number | null;
  avgRating: number | null;
  onTimeDeliveryPct: number | null;
  hasPortalAccess: boolean;
}

export interface PresenterDetailDto extends PresenterSummaryDto {
  phone: string | null;
  bio: string | null;
  location: string | null;
  timezone: string;
  supplierRef: string | null;
  /** Omitted entirely for PRESENTER-role callers. */
  internalNotes?: string | null;
  targetDeliverablesPerMonth: number | null;
  capacityWeight: number;
  contracts: PresenterContractDto[];
  availability: AvailabilityDto[];
  onboardedAt: string | null;
  createdAt: string;
  /** Rolling 12-month deliverable counts, oldest first, for the sparkline. */
  monthlyDeliverables: { month: string; count: number; earnedMinor: number }[];
}

export interface AvailabilityDto {
  id: string;
  type: AvailabilityType;
  startDate: string;
  endDate: string;
  note: string | null;
}

export interface AttachmentDto {
  id: string;
  kind: AttachmentKind;
  storage: StorageProvider;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Short-lived pre-signed GET url for S3 files; the raw link for external. */
  url: string | null;
  version: number;
  versionGroupId: string | null;
  isCurrent: boolean;
  visibleToPresenter: boolean;
  uploadedBy: Pick<UserDto, 'id' | 'name'>;
  createdAt: string;
}

export interface AssignmentSummaryDto {
  id: string;
  reference: string;
  title: string;
  status: AssignmentStatus;
  priority: Priority;
  brand: Pick<BrandDto, 'id' | 'name' | 'colorHex'>;
  presenter: Pick<PresenterSummaryDto, 'id' | 'displayName' | 'photoUrl'> | null;
  workType: Pick<WorkTypeDto, 'id' | 'name'> | null;
  deliverableCount: number;
  totalFeeMinor: number | null;
  feeCurrency: string;
  assignedAt: string | null;
  dueAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  turnaroundMinutes: number | null;
  latenessMinutes: number | null;
  scriptCount: number;
  hasDelivery: boolean;
  avgRating: number | null;
}

export interface AssignmentDetailDto extends AssignmentSummaryDto {
  description: string | null;
  feeMinor: number | null;
  feeUnit: RateUnit | null;
  feeQuantity: number;
  estimatedHours: number | null;
  actualHours: number | null;
  responseMinutes: number | null;
  revisionCount: number;
  deliveryUrl: string | null;
  deliveryNotes: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  approvedAt: string | null;
  createdBy: Pick<UserDto, 'id' | 'name'>;
  createdAt: string;
  attachments: AttachmentDto[];
  comments: CommentDto[];
  events: AssignmentEventDto[];
  feedback: FeedbackDto[];
  performance: PerformanceMetricDto[];
  /** Transitions the CURRENT caller is allowed to perform right now. */
  availableTransitions: { to: AssignmentStatus; label: string; tone: string; blockedBy: string[] }[];
}

export interface CommentDto {
  id: string;
  body: string;
  isInternal: boolean;
  author: Pick<UserDto, 'id' | 'name' | 'avatarUrl'>;
  createdAt: string;
}

export interface AssignmentEventDto {
  id: string;
  type: string;
  fromStatus: AssignmentStatus | null;
  toStatus: AssignmentStatus | null;
  payload: Record<string, unknown> | null;
  actor: Pick<UserDto, 'id' | 'name' | 'avatarUrl'> | null;
  createdAt: string;
}

export interface FeedbackDto {
  id: string;
  overallRating: number;
  deliveryRating: number | null;
  scriptAccuracy: number | null;
  professionalism: number | null;
  timeliness: number | null;
  productionQuality: number | null;
  comment: string | null;
  visibleToPresenter: boolean;
  author: Pick<UserDto, 'id' | 'name'>;
  createdAt: string;
}

export interface PerformanceMetricDto {
  id: string;
  platform: Platform;
  contentUrl: string | null;
  publishedAt: string | null;
  measuredOn: string;
  impressions: number | null;
  views: number | null;
  uniqueViewers: number | null;
  watchTimeMinutes: number | null;
  avgViewDurationSeconds: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  spendMinor: number | null;
  revenueMinor: number | null;
  currency: string;
  notes: string | null;
  recordedBy: Pick<UserDto, 'id' | 'name'>;
  derived: {
    engagementRatePct: number | null;
    ctrPct: number | null;
    conversionRatePct: number | null;
    costPerConversionMinor: number | null;
    roas: number | null;
    feeCostPerThousandViewsMinor: number | null;
  };
}

export interface DashboardDto {
  generatedAt: string;
  period: { from: string; to: string };
  kpis: {
    activeAssignments: number;
    dueThisWeek: number;
    overdue: number;
    awaitingResponse: number;
    awaitingReview: number;
    completedInPeriod: number;
    committedSpendMinor: number;
    currency: string;
    medianTurnaroundMinutes: number | null;
    onTimeDeliveryPct: number | null;
  };
  /** Presenters with no assignment in the last `goingColdAfterDays` days. */
  goingCold: Pick<PresenterSummaryDto, 'id' | 'displayName' | 'photoUrl' | 'lastAssignedAt'>[];
  contractsExpiringSoon: {
    presenterId: string;
    presenterName: string;
    brandName: string;
    expiresAt: string;
  }[];
  atRisk: AssignmentSummaryDto[];
  recentActivity: AssignmentEventDto[];
  throughputByWeek: { weekStart: string; assigned: number; completed: number }[];
}
