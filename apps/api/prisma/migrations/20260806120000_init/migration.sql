-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'PRESENTER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PresenterStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING', 'SIGNED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('PER_VIDEO', 'PER_FINISHED_MINUTE', 'PER_HOUR', 'PER_HALF_DAY', 'PER_DAY', 'PER_PROJECT');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'REVISIONS_REQUESTED', 'APPROVED', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('SCRIPT', 'BRIEF', 'REFERENCE', 'CONTRACT', 'DELIVERABLE', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('S3', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'X', 'WEBSITE', 'EMAIL', 'PAID_ADS', 'OTHER');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('UNAVAILABLE', 'LIMITED', 'PREFERRED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'STATUS_CHANGED', 'PRESENTER_CHANGED', 'DUE_DATE_CHANGED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'COMMENT_ADDED', 'DELIVERY_SUBMITTED', 'FEEDBACK_ADDED', 'PERFORMANCE_RECORDED', 'TIME_LOGGED', 'REMINDER_SENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT_OFFERED', 'ASSIGNMENT_ACCEPTED', 'ASSIGNMENT_DECLINED', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_OVERDUE', 'DELIVERY_SUBMITTED', 'REVISIONS_REQUESTED', 'APPROVED', 'FEEDBACK_RECEIVED', 'COMMENT_MENTION', 'CONTRACT_EXPIRING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PRODUCER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "presenterId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "colorHex" TEXT NOT NULL DEFAULT '#64748B',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultEstimatedHours" DECIMAL(6,2),
    "defaultTurnaroundDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenterTag" (
    "presenterId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PresenterTag_pkey" PRIMARY KEY ("presenterId","tagId")
);

-- CreateTable
CREATE TABLE "Presenter" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "status" "PresenterStatus" NOT NULL DEFAULT 'ONBOARDING',
    "defaultRateMinor" INTEGER,
    "defaultRateUnit" "RateUnit" NOT NULL DEFAULT 'PER_VIDEO',
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "targetDeliverablesPerMonth" INTEGER,
    "capacityWeight" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "internalNotes" TEXT,
    "supplierRef" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAssignedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "completedAssignments" INTEGER NOT NULL DEFAULT 0,
    "avgTurnaroundMinutes" INTEGER,
    "avgRating" DECIMAL(3,2),
    "onTimeDeliveryPct" DECIMAL(5,2),

    CONSTRAINT "Presenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenterBrand" (
    "id" TEXT NOT NULL,
    "presenterId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contractStatus" "ContractStatus" NOT NULL DEFAULT 'PENDING',
    "contractSignedAt" TIMESTAMP(3),
    "contractExpiresAt" TIMESTAMP(3),
    "rateMinor" INTEGER,
    "rateUnit" "RateUnit",
    "currency" CHAR(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenterBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "presenterId" TEXT NOT NULL,
    "type" "AvailabilityType" NOT NULL DEFAULT 'UNAVAILABLE',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brandId" TEXT NOT NULL,
    "presenterId" TEXT,
    "workTypeId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "deliverableCount" INTEGER NOT NULL DEFAULT 1,
    "feeMinor" INTEGER,
    "feeUnit" "RateUnit",
    "feeQuantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "feeCurrency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "totalFeeMinor" INTEGER,
    "estimatedHours" DECIMAL(6,2),
    "actualHours" DECIMAL(6,2),
    "assignedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "turnaroundMinutes" INTEGER,
    "responseMinutes" INTEGER,
    "latenessMinutes" INTEGER,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryUrl" TEXT,
    "deliveryNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCounter" (
    "brandId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BrandCounter_pkey" PRIMARY KEY ("brandId")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'SCRIPT',
    "assignmentId" TEXT,
    "presenterBrandId" TEXT,
    "storage" "StorageProvider" NOT NULL DEFAULT 'S3',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "versionGroupId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "visibleToPresenter" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "EventType" NOT NULL,
    "fromStatus" "AssignmentStatus",
    "toStatus" "AssignmentStatus",
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "presenterId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "workedOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "presenterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "deliveryRating" INTEGER,
    "scriptAccuracy" INTEGER,
    "professionalism" INTEGER,
    "timeliness" INTEGER,
    "productionQuality" INTEGER,
    "comment" TEXT,
    "visibleToPresenter" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetric" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "measuredOn" DATE NOT NULL,
    "impressions" INTEGER,
    "views" INTEGER,
    "uniqueViewers" INTEGER,
    "watchTimeMinutes" INTEGER,
    "avgViewDurationSeconds" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "leads" INTEGER,
    "conversions" INTEGER,
    "spendMinor" INTEGER,
    "revenueMinor" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "organisationName" TEXT NOT NULL DEFAULT 'Imperial Learning',
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "workloadUnderThreshold" DECIMAL(4,2) NOT NULL DEFAULT 0.80,
    "workloadOverThreshold" DECIMAL(4,2) NOT NULL DEFAULT 1.25,
    "goingColdAfterDays" INTEGER NOT NULL DEFAULT 30,
    "dueSoonHours" INTEGER NOT NULL DEFAULT 48,
    "contractExpiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_presenterId_key" ON "Invitation"("presenterId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_isActive_name_idx" ON "Brand"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkType_name_key" ON "WorkType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkType_slug_key" ON "WorkType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "PresenterTag_tagId_idx" ON "PresenterTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Presenter_userId_key" ON "Presenter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Presenter_email_key" ON "Presenter"("email");

-- CreateIndex
CREATE INDEX "Presenter_status_lastAssignedAt_idx" ON "Presenter"("status", "lastAssignedAt");

-- CreateIndex
CREATE INDEX "Presenter_displayName_idx" ON "Presenter"("displayName");

-- CreateIndex
CREATE INDEX "PresenterBrand_brandId_contractStatus_idx" ON "PresenterBrand"("brandId", "contractStatus");

-- CreateIndex
CREATE INDEX "PresenterBrand_contractExpiresAt_idx" ON "PresenterBrand"("contractExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresenterBrand_presenterId_brandId_key" ON "PresenterBrand"("presenterId", "brandId");

-- CreateIndex
CREATE INDEX "Availability_presenterId_startDate_endDate_idx" ON "Availability"("presenterId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_reference_key" ON "Assignment"("reference");

-- CreateIndex
CREATE INDEX "Assignment_status_dueAt_idx" ON "Assignment"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Assignment_presenterId_status_idx" ON "Assignment"("presenterId", "status");

-- CreateIndex
CREATE INDEX "Assignment_brandId_createdAt_idx" ON "Assignment"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "Assignment_assignedAt_idx" ON "Assignment"("assignedAt");

-- CreateIndex
CREATE INDEX "Assignment_completedAt_idx" ON "Assignment"("completedAt");

-- CreateIndex
CREATE INDEX "Attachment_assignmentId_kind_isCurrent_idx" ON "Attachment"("assignmentId", "kind", "isCurrent");

-- CreateIndex
CREATE INDEX "Attachment_versionGroupId_idx" ON "Attachment"("versionGroupId");

-- CreateIndex
CREATE INDEX "Comment_assignmentId_createdAt_idx" ON "Comment"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentEvent_assignmentId_createdAt_idx" ON "AssignmentEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeLog_assignmentId_idx" ON "TimeLog"("assignmentId");

-- CreateIndex
CREATE INDEX "TimeLog_presenterId_workedOn_idx" ON "TimeLog"("presenterId", "workedOn");

-- CreateIndex
CREATE INDEX "Feedback_presenterId_createdAt_idx" ON "Feedback"("presenterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_assignmentId_authorId_key" ON "Feedback"("assignmentId", "authorId");

-- CreateIndex
CREATE INDEX "PerformanceMetric_assignmentId_platform_measuredOn_idx" ON "PerformanceMetric"("assignmentId", "platform", "measuredOn");

-- CreateIndex
CREATE INDEX "PerformanceMetric_measuredOn_idx" ON "PerformanceMetric"("measuredOn");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceMetric_assignmentId_platform_measuredOn_key" ON "PerformanceMetric"("assignmentId", "platform", "measuredOn");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenterTag" ADD CONSTRAINT "PresenterTag_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenterTag" ADD CONSTRAINT "PresenterTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presenter" ADD CONSTRAINT "Presenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenterBrand" ADD CONSTRAINT "PresenterBrand_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenterBrand" ADD CONSTRAINT "PresenterBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "WorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_presenterBrandId_fkey" FOREIGN KEY ("presenterBrandId") REFERENCES "PresenterBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_presenterId_fkey" FOREIGN KEY ("presenterId") REFERENCES "Presenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetric" ADD CONSTRAINT "PerformanceMetric_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

