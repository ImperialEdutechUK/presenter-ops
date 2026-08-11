import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  allowedTransitions,
  canTransition,
  computeTotalFeeMinor,
  computeTiming,
  missingRequirements,
  parseMoneyToMinor,
  type AssignmentQuery,
  type AssignmentStatus,
  type CreateAssignmentInput,
} from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { PresentersService } from '../presenters/presenters.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, toSkipTake } from '../../common/pagination';
import type { AuthenticatedUser } from '../../common/decorators';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
    private readonly presenters: PresentersService,
    private readonly notifications: NotificationsService,
  ) {}

  // ==========================================================================
  // Create
  // ==========================================================================

  async create(input: CreateAssignmentInput, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const brandId = await this.taxonomy.resolveBrand(input.brand, tx);
      const workTypeId = await this.taxonomy.resolveWorkType(input.workType ?? null, tx);
      const reference = await this.nextReference(brandId, tx);

      // Fee resolution order:
      //   1. explicitly typed on the form
      //   2. the presenter's rate for THIS brand
      //   3. the presenter's default rate
      // Whatever wins is snapshotted onto the assignment and never re-read.
      let feeMinor: number | null = null;
      let feeUnit = input.feeUnit ?? null;
      let feeCurrency = input.feeCurrency;

      if (input.fee !== null && input.fee !== undefined && input.fee !== '') {
        feeMinor = parseMoneyToMinor(input.fee, feeCurrency);
      } else if (input.presenterId) {
        const resolved = await this.resolveRate(input.presenterId, brandId, tx);
        feeMinor = resolved.rateMinor;
        feeUnit = feeUnit ?? resolved.rateUnit;
        feeCurrency = resolved.currency;
      }

      const totalFeeMinor = computeTotalFeeMinor(feeMinor, input.feeQuantity, feeUnit);

      const assignment = await tx.assignment.create({
        data: {
          reference,
          title: input.title.trim(),
          description: input.description || null,
          brandId,
          presenterId: input.presenterId ?? null,
          workTypeId,
          createdById: actor.id,
          status: 'DRAFT',
          priority: input.priority,
          deliverableCount: input.deliverableCount,
          feeMinor,
          feeUnit,
          feeQuantity: new Prisma.Decimal(input.feeQuantity),
          feeCurrency,
          totalFeeMinor,
          estimatedHours:
            input.estimatedHours === null || input.estimatedHours === undefined
              ? null
              : new Prisma.Decimal(input.estimatedHours),
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        },
      });

      await tx.assignmentEvent.create({
        data: {
          assignmentId: assignment.id,
          actorId: actor.id,
          type: 'ASSIGNMENT_CREATED',
          toStatus: 'DRAFT',
        },
      });

      return assignment;
    });
  }

  /**
   * Human reference codes: ASP-0001, SLC-0002…
   *
   * The counter lives in its own row and is bumped inside the same transaction
   * as the insert, so two producers creating assignments at the same moment
   * cannot be handed the same number.
   */
  private async nextReference(brandId: string, tx: Prisma.TransactionClient): Promise<string> {
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId } });
    const prefix = brand.slug
      .split('-')
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(3, 'X');

    // `next` is the value the NEXT assignment will take. Creating the row with
    // next: 2 and incrementing thereafter means the number just consumed is
    // always `next - 1`, in both the create and the update branch.
    const counter = await tx.brandCounter.upsert({
      where: { brandId },
      create: { brandId, prefix, next: 2 },
      update: { next: { increment: 1 } },
    });

    return `${counter.prefix}-${String(counter.next - 1).padStart(4, '0')}`;
  }

  private async resolveRate(presenterId: string, brandId: string, tx: Prisma.TransactionClient) {
    const presenter = await tx.presenter.findUniqueOrThrow({ where: { id: presenterId } });
    const contract = await tx.presenterBrand.findUnique({
      where: { presenterId_brandId: { presenterId, brandId } },
    });

    return {
      rateMinor: contract?.rateMinor ?? presenter.defaultRateMinor,
      rateUnit: contract?.rateUnit ?? presenter.defaultRateUnit,
      currency: contract?.currency ?? presenter.defaultCurrency,
      source: contract?.rateMinor ? ('brand' as const) : ('default' as const),
    };
  }

  // ==========================================================================
  // Update
  // ==========================================================================

  async update(id: string, input: any, actor: AuthenticatedUser) {
    const current = await this.prisma.assignment.findUniqueOrThrow({ where: { id } });
    this.assertCanEdit(current, actor);

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.AssignmentUpdateInput = {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      const track = (field: string, from: unknown, to: unknown) => {
        if (from instanceof Date ? from.getTime() !== new Date(to as string).getTime() : from !== to) {
          changes[field] = { from, to };
        }
      };

      if (input.title !== undefined) {
        track('title', current.title, input.title);
        data.title = input.title.trim();
      }
      if (input.description !== undefined) data.description = input.description;
      if (input.priority !== undefined) {
        track('priority', current.priority, input.priority);
        data.priority = input.priority;
      }
      if (input.deliverableCount !== undefined) data.deliverableCount = input.deliverableCount;
      if (input.estimatedHours !== undefined) {
        data.estimatedHours =
          input.estimatedHours === null ? null : new Prisma.Decimal(input.estimatedHours);
      }
      if (input.dueAt !== undefined) {
        track('dueAt', current.dueAt, input.dueAt);
        data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      }
      if (input.deliveryUrl !== undefined) data.deliveryUrl = input.deliveryUrl;
      if (input.deliveryNotes !== undefined) data.deliveryNotes = input.deliveryNotes;

      if (input.workType !== undefined) {
        const workTypeId = await this.taxonomy.resolveWorkType(input.workType, tx);
        data.workType = workTypeId ? { connect: { id: workTypeId } } : { disconnect: true };
      }

      if (input.presenterId !== undefined && input.presenterId !== current.presenterId) {
        // Reassigning after work has started would corrupt the turnaround
        // figures for both people, so it is blocked past ACCEPTED.
        if (!['DRAFT', 'ASSIGNED', 'DECLINED'].includes(current.status)) {
          throw new BadRequestException(
            'Work has already started. Cancel this assignment and raise a new one instead of swapping the presenter.',
          );
        }
        track('presenterId', current.presenterId, input.presenterId);
        data.presenter = input.presenterId
          ? { connect: { id: input.presenterId } }
          : { disconnect: true };
      }

      // Money can only be edited before the presenter has accepted it — after
      // that it is an agreed figure and changing it silently is not acceptable.
      const feeTouched =
        input.fee !== undefined || input.feeUnit !== undefined || input.feeQuantity !== undefined;
      if (feeTouched) {
        if (['ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'COMPLETED'].includes(current.status)) {
          throw new BadRequestException(
            'The fee was agreed when the presenter accepted this job and can no longer be changed here. Add a note explaining any variation instead.',
          );
        }
        const feeCurrency = input.feeCurrency ?? current.feeCurrency;
        const feeMinor =
          input.fee === undefined
            ? current.feeMinor
            : input.fee === null
              ? null
              : parseMoneyToMinor(input.fee, feeCurrency);
        const feeUnit = input.feeUnit ?? current.feeUnit;
        const feeQuantity = input.feeQuantity ?? Number(current.feeQuantity);

        data.feeMinor = feeMinor;
        data.feeUnit = feeUnit;
        data.feeQuantity = new Prisma.Decimal(feeQuantity);
        data.feeCurrency = feeCurrency;
        data.totalFeeMinor = computeTotalFeeMinor(feeMinor, feeQuantity, feeUnit);
        track('fee', current.totalFeeMinor, data.totalFeeMinor);
      }

      const updated = await tx.assignment.update({ where: { id }, data });

      if (Object.keys(changes).length > 0) {
        await tx.assignmentEvent.create({
          data: {
            assignmentId: id,
            actorId: actor.id,
            type: changes.presenterId ? 'PRESENTER_CHANGED' : 'ASSIGNMENT_UPDATED',
            payload: changes as Prisma.InputJsonValue,
          },
        });
      }

      return updated;
    });
  }

  private assertCanEdit(assignment: { presenterId: string | null }, actor: AuthenticatedUser) {
    if (actor.role === 'PRESENTER' && assignment.presenterId !== actor.presenterId) {
      throw new ForbiddenException('This assignment is not yours.');
    }
    if (['MARKETING', 'FINANCE', 'VIEWER'].includes(actor.role)) {
      throw new ForbiddenException('Your role cannot edit the assignment brief.');
    }
  }

  // ==========================================================================
  // State transitions — the heart of the tracking
  // ==========================================================================

  async transition(
    id: string,
    to: AssignmentStatus,
    actor: AuthenticatedUser,
    extra: { deliveryUrl?: string; note?: string } = {},
  ) {
    const current = await this.prisma.assignment.findUnique({
      where: { id },
      include: { presenter: true, brand: true },
    });
    if (!current) throw new NotFoundException('Assignment not found.');

    if (actor.role === 'PRESENTER' && current.presenterId !== actor.presenterId) {
      throw new ForbiddenException('This assignment is not yours.');
    }

    if (!canTransition(current.status, to, actor.role)) {
      const options = allowedTransitions(current.status, actor.role).map((t) => t.to);
      throw new BadRequestException(
        options.length
          ? `Cannot move from ${current.status} to ${to}. Available: ${options.join(', ')}.`
          : `Nothing further can be done with an assignment that is ${current.status}.`,
      );
    }

    const candidate = { ...current, deliveryUrl: extra.deliveryUrl ?? current.deliveryUrl };
    const missing = missingRequirements(current.status, to, candidate);
    if (missing.length) {
      throw new BadRequestException(
        `Fill these in first: ${missing.map(friendlyFieldName).join(', ')}.`,
      );
    }

    if (to === 'REVISIONS_REQUESTED' && !extra.note) {
      throw new BadRequestException('Say what needs changing — the presenter needs something to act on.');
    }

    const now = new Date();
    const data: Prisma.AssignmentUpdateInput = { status: to };

    switch (to) {
      case 'ASSIGNED':
        data.assignedAt = now;
        break;
      case 'ACCEPTED':
        data.acceptedAt = now;
        data.responseMinutes = current.assignedAt
          ? Math.round((now.getTime() - current.assignedAt.getTime()) / 60_000)
          : null;
        break;
      case 'IN_PROGRESS':
        if (!current.startedAt) data.startedAt = now;
        break;
      case 'SUBMITTED': {
        data.submittedAt = now;
        if (extra.deliveryUrl) data.deliveryUrl = extra.deliveryUrl;
        const timing = computeTiming({
          assignedAt: current.assignedAt,
          acceptedAt: current.acceptedAt,
          submittedAt: now,
          dueAt: current.dueAt,
        });
        data.turnaroundMinutes = timing.turnaroundMinutes;
        data.latenessMinutes = timing.latenessMinutes;
        break;
      }
      case 'REVISIONS_REQUESTED':
        data.revisionCount = { increment: 1 };
        break;
      case 'APPROVED':
        data.approvedAt = now;
        break;
      case 'COMPLETED':
        data.completedAt = now;
        break;
      case 'CANCELLED':
        data.cancelledAt = now;
        break;
      case 'DRAFT':
        // Reassigning after a decline: clear the presenter and the clock.
        data.presenter = { disconnect: true };
        data.assignedAt = null;
        data.acceptedAt = null;
        data.responseMinutes = null;
        break;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.assignment.update({ where: { id }, data });

      await tx.assignmentEvent.create({
        data: {
          assignmentId: id,
          actorId: actor.id,
          type: to === 'SUBMITTED' ? 'DELIVERY_SUBMITTED' : 'STATUS_CHANGED',
          fromStatus: current.status,
          toStatus: to,
          payload: extra.note ? { note: extra.note } : undefined,
        },
      });

      if (extra.note) {
        await tx.comment.create({
          data: {
            assignmentId: id,
            authorId: actor.id,
            body: extra.note,
            isInternal: false,
          },
        });
      }

      return result;
    });

    // Cached presenter stats depend on assignment outcomes, so refresh them
    // whenever an outcome changes. Cheap: a handful of indexed aggregates.
    if (current.presenterId) {
      await this.presenters.recomputeStats(current.presenterId);
    }

    await this.notifications.onAssignmentTransition({
      assignment: updated,
      from: current.status,
      to,
      actor,
      presenter: current.presenter,
      brandName: current.brand.name,
      note: extra.note,
    });

    return updated;
  }

  // ==========================================================================
  // Read
  // ==========================================================================

  async findMany(query: AssignmentQuery, viewer: AuthenticatedUser) {
    const where: Prisma.AssignmentWhereInput = {};

    // Presenters only ever see their own work, and never other people's drafts.
    if (viewer.role === 'PRESENTER') {
      where.presenterId = viewer.presenterId ?? '__none__';
      where.status = { notIn: ['DRAFT'] };
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { reference: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.status?.length) where.status = { in: query.status };
    if (query.brandId?.length) where.brandId = { in: query.brandId };
    if (query.presenterId?.length && viewer.role !== 'PRESENTER') {
      where.presenterId = { in: query.presenterId };
    }
    if (query.workTypeId?.length) where.workTypeId = { in: query.workTypeId };
    if (query.priority?.length) where.priority = { in: query.priority };
    if (query.unassignedOnly) where.presenterId = null;
    if (query.dueFrom || query.dueTo) {
      where.dueAt = {
        ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
        ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
      };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }
    if (query.overdueOnly) {
      where.dueAt = { lt: new Date() };
      where.status = { in: ACTIVE_ASSIGNMENT_STATUSES };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        orderBy: this.orderBy(query),
        ...toSkipTake(query),
        include: {
          brand: { select: { id: true, name: true, colorHex: true } },
          presenter: { select: { id: true, displayName: true, photoUrl: true } },
          workType: { select: { id: true, name: true } },
          _count: { select: { attachments: { where: { kind: 'SCRIPT', isCurrent: true } } } },
          feedback: { select: { overallRating: true } },
        },
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return paginate(rows.map(toSummaryDto), total, query);
  }

  private orderBy(query: AssignmentQuery): Prisma.AssignmentOrderByWithRelationInput[] {
    const dir = query.direction;
    switch (query.sort) {
      case 'createdAt':
        return [{ createdAt: dir }];
      case 'assignedAt':
        return [{ assignedAt: { sort: dir, nulls: 'last' } }];
      case 'reference':
        return [{ reference: dir }];
      case 'turnaroundMinutes':
        return [{ turnaroundMinutes: { sort: dir, nulls: 'last' } }];
      case 'priority':
        // Postgres orders enums by declaration order, which is LOW→URGENT,
        // so "most urgent first" is desc.
        return [{ priority: dir === 'asc' ? 'desc' : 'asc' }, { dueAt: 'asc' }];
      default:
        return [{ dueAt: { sort: dir, nulls: 'last' } }];
    }
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        brand: true,
        presenter: { select: { id: true, displayName: true, photoUrl: true } },
        workType: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        feedback: { include: { author: { select: { id: true, name: true } } } },
        performance: {
          include: { recordedBy: { select: { id: true, name: true } } },
          orderBy: { measuredOn: 'desc' },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');

    const isPresenter = viewer.role === 'PRESENTER';
    if (isPresenter && assignment.presenterId !== viewer.presenterId) {
      throw new ForbiddenException('This assignment is not yours.');
    }

    return {
      ...toSummaryDto(assignment),
      description: assignment.description,
      feeMinor: assignment.feeMinor,
      feeUnit: assignment.feeUnit,
      feeQuantity: Number(assignment.feeQuantity),
      estimatedHours: assignment.estimatedHours ? Number(assignment.estimatedHours) : null,
      actualHours: assignment.actualHours ? Number(assignment.actualHours) : null,
      responseMinutes: assignment.responseMinutes,
      revisionCount: assignment.revisionCount,
      deliveryUrl: assignment.deliveryUrl,
      deliveryNotes: assignment.deliveryNotes,
      acceptedAt: assignment.acceptedAt,
      startedAt: assignment.startedAt,
      approvedAt: assignment.approvedAt,
      createdBy: assignment.createdBy,
      createdAt: assignment.createdAt,

      // Presenter-facing filtering, done here rather than in the client so a
      // crafted request can never reach the hidden material.
      attachments: assignment.attachments.filter(
        (a) => !isPresenter || (a.visibleToPresenter && a.isCurrent),
      ),
      comments: assignment.comments.filter((c) => !isPresenter || !c.isInternal),
      feedback: assignment.feedback.filter((f) => !isPresenter || f.visibleToPresenter),
      performance: isPresenter ? [] : assignment.performance,
      events: assignment.events,

      availableTransitions: allowedTransitions(assignment.status, viewer.role).map((t) => ({
        to: t.to,
        label: t.label,
        tone: t.tone ?? 'default',
        description: t.description ?? null,
        blockedBy: missingRequirements(assignment.status, t.to, assignment).map(friendlyFieldName),
      })),
    };
  }

  // ==========================================================================
  // Comments and time
  // ==========================================================================

  async addComment(assignmentId: string, body: string, isInternal: boolean, actor: AuthenticatedUser) {
    if (isInternal && actor.role === 'PRESENTER') {
      throw new ForbiddenException('Presenters cannot post internal notes.');
    }
    const comment = await this.prisma.comment.create({
      data: { assignmentId, authorId: actor.id, body, isInternal },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await this.prisma.assignmentEvent.create({
      data: { assignmentId, actorId: actor.id, type: 'COMMENT_ADDED' },
    });
    return comment;
  }

  async logTime(assignmentId: string, input: any, actor: AuthenticatedUser) {
    const assignment = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
    });
    const presenterId =
      actor.role === 'PRESENTER' ? actor.presenterId : assignment.presenterId;
    if (!presenterId) throw new BadRequestException('This assignment has no presenter yet.');

    await this.prisma.timeLog.create({
      data: {
        assignmentId,
        presenterId,
        minutes: input.minutes,
        workedOn: new Date(input.workedOn),
        note: input.note ?? null,
      },
    });

    const total = await this.prisma.timeLog.aggregate({
      where: { assignmentId },
      _sum: { minutes: true },
    });

    return this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        actualHours: new Prisma.Decimal(((total._sum.minutes ?? 0) / 60).toFixed(2)),
      },
    });
  }
}

// ---------------------------------------------------------------------------

function toSummaryDto(a: any) {
  return {
    id: a.id,
    reference: a.reference,
    title: a.title,
    status: a.status,
    priority: a.priority,
    brand: a.brand ? { id: a.brand.id, name: a.brand.name, colorHex: a.brand.colorHex } : null,
    presenter: a.presenter ?? null,
    workType: a.workType ?? null,
    deliverableCount: a.deliverableCount,
    totalFeeMinor: a.totalFeeMinor,
    feeCurrency: a.feeCurrency,
    assignedAt: a.assignedAt,
    dueAt: a.dueAt,
    submittedAt: a.submittedAt,
    completedAt: a.completedAt,
    turnaroundMinutes: a.turnaroundMinutes,
    latenessMinutes: a.latenessMinutes,
    scriptCount: a._count?.attachments ?? a.attachments?.filter((x: any) => x.kind === 'SCRIPT').length ?? 0,
    hasDelivery: Boolean(a.deliveryUrl),
    avgRating:
      a.feedback && a.feedback.length
        ? Number(
            (
              a.feedback.reduce((sum: number, f: any) => sum + f.overallRating, 0) /
              a.feedback.length
            ).toFixed(2),
          )
        : null,
  };
}

function friendlyFieldName(field: string): string {
  return (
    {
      presenterId: 'a presenter',
      dueAt: 'a due date',
      feeMinor: 'a fee',
      deliveryUrl: 'the delivery link',
    }[field] ?? field
  );
}
