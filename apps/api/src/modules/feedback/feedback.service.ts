import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PresentersService } from '../presenters/presenters.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../../common/decorators';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenters: PresentersService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * One review per person per assignment; posting again edits your own review
   * rather than stacking duplicates. Several colleagues can each leave one,
   * and the assignment shows the mean.
   */
  async upsert(assignmentId: string, input: any, actor: AuthenticatedUser) {
    const assignment = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { presenter: { include: { user: true } } },
    });

    if (!assignment.presenterId) {
      throw new BadRequestException('There is no presenter on this assignment to review.');
    }
    if (!['SUBMITTED', 'IN_REVIEW', 'REVISIONS_REQUESTED', 'APPROVED', 'COMPLETED'].includes(assignment.status)) {
      throw new BadRequestException(
        'Wait until the work has been submitted before recording feedback.',
      );
    }

    const feedback = await this.prisma.feedback.upsert({
      where: { assignmentId_authorId: { assignmentId, authorId: actor.id } },
      create: {
        assignmentId,
        presenterId: assignment.presenterId,
        authorId: actor.id,
        overallRating: input.overallRating,
        deliveryRating: input.deliveryRating ?? null,
        scriptAccuracy: input.scriptAccuracy ?? null,
        professionalism: input.professionalism ?? null,
        timeliness: input.timeliness ?? null,
        productionQuality: input.productionQuality ?? null,
        comment: input.comment ?? null,
        visibleToPresenter: input.visibleToPresenter,
        sharedAt: input.visibleToPresenter ? new Date() : null,
      },
      update: {
        overallRating: input.overallRating,
        deliveryRating: input.deliveryRating ?? null,
        scriptAccuracy: input.scriptAccuracy ?? null,
        professionalism: input.professionalism ?? null,
        timeliness: input.timeliness ?? null,
        productionQuality: input.productionQuality ?? null,
        comment: input.comment ?? null,
        visibleToPresenter: input.visibleToPresenter,
        sharedAt: input.visibleToPresenter ? new Date() : null,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    await this.prisma.assignmentEvent.create({
      data: { assignmentId, actorId: actor.id, type: 'FEEDBACK_ADDED' },
    });

    await this.presenters.recomputeStats(assignment.presenterId);

    if (input.visibleToPresenter && assignment.presenter?.user) {
      await this.notifications.create({
        userId: assignment.presenter.user.id,
        type: 'FEEDBACK_RECEIVED',
        title: `Feedback on ${assignment.reference}`,
        body: 'Your producer has shared feedback on a recent job.',
        linkUrl: `/portal/assignments/${assignmentId}`,
      });
    }

    return feedback;
  }

  /** Every review a presenter has received, newest first. */
  listForPresenter(presenterId: string, onlyShared = false) {
    return this.prisma.feedback.findMany({
      where: { presenterId, ...(onlyShared ? { visibleToPresenter: true } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        assignment: {
          select: {
            id: true,
            reference: true,
            title: true,
            completedAt: true,
            brand: { select: { id: true, name: true, colorHex: true } },
          },
        },
      },
    });
  }

  /**
   * Average of each rating dimension for a presenter, so the profile can show
   * where someone is strong rather than a single blended number.
   */
  async dimensionAverages(presenterId: string) {
    const agg = await this.prisma.feedback.aggregate({
      where: { presenterId },
      _avg: {
        overallRating: true,
        deliveryRating: true,
        scriptAccuracy: true,
        professionalism: true,
        timeliness: true,
        productionQuality: true,
      },
      _count: { _all: true },
    });

    const round = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));

    return {
      sampleSize: agg._count._all,
      overall: round(agg._avg.overallRating),
      delivery: round(agg._avg.deliveryRating),
      scriptAccuracy: round(agg._avg.scriptAccuracy),
      professionalism: round(agg._avg.professionalism),
      timeliness: round(agg._avg.timeliness),
      productionQuality: round(agg._avg.productionQuality),
    };
  }
}
