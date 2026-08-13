import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  DELIVERED_ASSIGNMENT_STATUSES,
  parseMoneyToMinor,
  type CreatePresenterInput,
  type PresenterQuery,
  type UpdatePresenterInput,
} from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { paginate, toSkipTake } from '../../common/pagination';
import type { AuthenticatedUser } from '../../common/decorators';

@Injectable()
export class PresentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  // ==========================================================================
  // Create / update
  // ==========================================================================

  /**
   * Creates the profile, its brand contracts and its tags in ONE transaction.
   * If any brand name is invalid the whole thing rolls back — you never end up
   * with a half-made presenter that has to be cleaned up by hand.
   */
  async create(input: CreatePresenterInput) {
    const presenterId = await this.prisma.$transaction(async (tx) => {
      const tagIds = await this.taxonomy.resolveTags(input.tags, tx);

      const presenter = await tx.presenter.create({
        data: {
          fullName: input.fullName.trim(),
          displayName: (input.displayName || input.fullName).trim(),
          email: input.email.toLowerCase().trim(),
          phone: input.phone || null,
          photoUrl: input.photoUrl ?? null,
          bio: input.bio || null,
          location: input.location || null,
          timezone: input.timezone,
          status: input.status,
          defaultRateMinor:
            input.defaultRate === null || input.defaultRate === undefined
              ? null
              : parseMoneyToMinor(input.defaultRate, input.defaultCurrency),
          defaultRateUnit: input.defaultRateUnit,
          defaultCurrency: input.defaultCurrency,
          targetDeliverablesPerMonth: input.targetDeliverablesPerMonth ?? null,
          capacityWeight: new Prisma.Decimal(input.capacityWeight),
          supplierRef: input.supplierRef || null,
          internalNotes: input.internalNotes || null,
          onboardedAt: input.status === 'ACTIVE' ? new Date() : null,
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });

      for (const contract of input.contracts) {
        const brandId = await this.taxonomy.resolveBrand(contract.brand, tx);

        await tx.presenterBrand.create({
          data: {
            presenterId: presenter.id,
            brandId,
            contractStatus: contract.contractStatus,
            contractSignedAt: contract.contractSignedAt
              ? new Date(contract.contractSignedAt)
              : null,
            contractExpiresAt: contract.contractExpiresAt
              ? new Date(contract.contractExpiresAt)
              : null,
            rateMinor:
              contract.rate === null || contract.rate === undefined
                ? null
                : parseMoneyToMinor(
                    contract.rate,
                    contract.currency ?? input.defaultCurrency,
                  ),
            rateUnit: contract.rateUnit ?? null,
            currency: contract.currency ?? null,
            notes: contract.notes ?? null,
          },
        });
      }

      return presenter.id;
    });

    // The transaction has committed, so findOne can now see the presenter.
    return this.findOne(presenterId);
  }

  async update(id: string, input: UpdatePresenterInput) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.presenter.findUniqueOrThrow({
        where: { id },
      });

      const data: Prisma.PresenterUpdateInput = {};

      if (input.fullName !== undefined) {
        data.fullName = input.fullName.trim();
      }

      if (input.displayName !== undefined) {
        data.displayName = input.displayName.trim();
      }

      if (input.email !== undefined) {
        data.email = input.email.toLowerCase().trim();
      }

      if (input.phone !== undefined) {
        data.phone = input.phone || null;
      }

      if (input.photoUrl !== undefined) {
        data.photoUrl = input.photoUrl;
      }

      if (input.bio !== undefined) {
        data.bio = input.bio || null;
      }

      if (input.location !== undefined) {
        data.location = input.location || null;
      }

      if (input.timezone !== undefined) {
        data.timezone = input.timezone;
      }

      if (input.supplierRef !== undefined) {
        data.supplierRef = input.supplierRef || null;
      }

      if (input.internalNotes !== undefined) {
        data.internalNotes = input.internalNotes || null;
      }

      if (input.targetDeliverablesPerMonth !== undefined) {
        data.targetDeliverablesPerMonth = input.targetDeliverablesPerMonth;
      }

      if (input.capacityWeight !== undefined) {
        data.capacityWeight = new Prisma.Decimal(input.capacityWeight);
      }

      if (input.defaultRateUnit !== undefined) {
        data.defaultRateUnit = input.defaultRateUnit;
      }

      if (input.defaultCurrency !== undefined) {
        data.defaultCurrency = input.defaultCurrency;
      }

      if (input.defaultRate !== undefined) {
        data.defaultRateMinor =
          input.defaultRate === null
            ? null
            : parseMoneyToMinor(
                input.defaultRate,
                input.defaultCurrency ?? current.defaultCurrency,
              );
      }

      if (input.status !== undefined) {
        data.status = input.status;

        if (input.status === 'ACTIVE' && !current.onboardedAt) {
          data.onboardedAt = new Date();
        }

        if (input.status === 'ARCHIVED') {
          data.archivedAt = new Date();
        }
      }

      await tx.presenter.update({
        where: { id },
        data,
      });

      // Tags are replaced wholesale — the UI always sends the complete set.
      if (input.tags) {
        const tagIds = await this.taxonomy.resolveTags(input.tags, tx);

        await tx.presenterTag.deleteMany({
          where: { presenterId: id },
        });

        await tx.presenterTag.createMany({
          data: tagIds.map((tagId) => ({
            presenterId: id,
            tagId,
          })),
          skipDuplicates: true,
        });
      }
    });

    // Read the presenter after the transaction has committed.
    return this.findOne(id);
  }

  // ==========================================================================
  // Contracts (the "websites they have signed to")
  // ==========================================================================

  async upsertContract(presenterId: string, input: any) {
    return this.prisma.$transaction(async (tx) => {
      const presenter = await tx.presenter.findUniqueOrThrow({
        where: { id: presenterId },
      });

      const brandId = await this.taxonomy.resolveBrand(input.brand, tx);

      const rateMinor =
        input.rate === null || input.rate === undefined
          ? null
          : parseMoneyToMinor(
              input.rate,
              input.currency ?? presenter.defaultCurrency,
            );

      return tx.presenterBrand.upsert({
        where: {
          presenterId_brandId: {
            presenterId,
            brandId,
          },
        },
        create: {
          presenterId,
          brandId,
          contractStatus: input.contractStatus ?? 'PENDING',
          contractSignedAt: input.contractSignedAt
            ? new Date(input.contractSignedAt)
            : null,
          contractExpiresAt: input.contractExpiresAt
            ? new Date(input.contractExpiresAt)
            : null,
          rateMinor,
          rateUnit: input.rateUnit ?? null,
          currency: input.currency ?? null,
          notes: input.notes ?? null,
        },
        update: {
          contractStatus: input.contractStatus,
          contractSignedAt: input.contractSignedAt
            ? new Date(input.contractSignedAt)
            : null,
          contractExpiresAt: input.contractExpiresAt
            ? new Date(input.contractExpiresAt)
            : null,
          rateMinor,
          rateUnit: input.rateUnit ?? null,
          currency: input.currency ?? null,
          notes: input.notes ?? null,
        },
        include: {
          brand: true,
        },
      });
    });
  }

  async removeContract(presenterId: string, contractId: string) {
    const contract = await this.prisma.presenterBrand.findUniqueOrThrow({
      where: {
        id: contractId,
      },
    });

    if (contract.presenterId !== presenterId) {
      throw new NotFoundException(
        'That contract does not belong to this presenter.',
      );
    }

    return this.prisma.presenterBrand.delete({
      where: {
        id: contractId,
      },
    });
  }

  // ==========================================================================
  // Read
  // ==========================================================================

  async findMany(query: PresenterQuery) {
    const where: Prisma.PresenterWhereInput = {};

    if (query.q) {
      where.OR = [
        {
          displayName: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          fullName: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.status?.length) {
      where.status = {
        in: query.status,
      };
    }

    if (query.brandId?.length) {
      where.contracts = {
        some: {
          brandId: {
            in: query.brandId,
          },
        },
      };
    }

    if (query.tagId?.length) {
      where.tags = {
        some: {
          tagId: {
            in: query.tagId,
          },
        },
      };
    }

    if (query.coldForDays) {
      const cutoff = new Date(
        Date.now() - query.coldForDays * 86_400_000,
      );

      where.OR = [
        ...(where.OR ?? []),
        {
          lastAssignedAt: null,
        },
        {
          lastAssignedAt: {
            lt: cutoff,
          },
        },
      ];
    }

    const orderBy = this.orderBy(query.sort, query.direction);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.presenter.findMany({
        where,
        orderBy,
        ...toSkipTake(query),
        include: {
          contracts: {
            include: {
              brand: true,
            },
          },
          tags: {
            include: {
              tag: true,
            },
          },
          user: {
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              assignments: {
                where: {
                  status: {
                    in: ACTIVE_ASSIGNMENT_STATUSES,
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.presenter.count({
        where,
      }),
    ]);

    return paginate(
      rows.map((r) => this.toSummary(r)),
      total,
      query,
    );
  }

  private orderBy(
    sort: PresenterQuery['sort'],
    direction: 'asc' | 'desc',
  ): Prisma.PresenterOrderByWithRelationInput {
    switch (sort) {
      case 'lastAssignedAt':
        // nulls last so "never assigned" does not dominate a desc sort
        return {
          lastAssignedAt: {
            sort: direction,
            nulls: 'last',
          },
        };

      case 'completedAssignments':
        return {
          completedAssignments: direction,
        };

      case 'avgRating':
        return {
          avgRating: {
            sort: direction,
            nulls: 'last',
          },
        };

      case 'avgTurnaroundMinutes':
        return {
          avgTurnaroundMinutes: {
            sort: direction,
            nulls: 'last',
          },
        };

      case 'createdAt':
        return {
          createdAt: direction,
        };

      default:
        return {
          displayName: direction,
        };
    }
  }

  async findOne(id: string, viewer?: AuthenticatedUser) {
    if (
      viewer?.role === 'PRESENTER' &&
      viewer.presenterId !== id
    ) {
      throw new ForbiddenException(
        'You can only view your own profile.',
      );
    }

    const presenter = await this.prisma.presenter.findUnique({
      where: {
        id,
      },
      include: {
        contracts: {
          include: {
            brand: true,
            attachments: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        availability: {
          orderBy: {
            startDate: 'asc',
          },
        },
        user: {
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            assignments: {
              where: {
                status: {
                  in: ACTIVE_ASSIGNMENT_STATUSES,
                },
              },
            },
          },
        },
      },
    });

    if (!presenter) {
      throw new NotFoundException('Presenter not found.');
    }

    const monthlyDeliverables = await this.monthlyDeliverables(id);

    const dto: Record<string, unknown> = {
      ...this.toSummary(presenter),
      phone: presenter.phone,
      bio: presenter.bio,
      location: presenter.location,
      timezone: presenter.timezone,
      supplierRef: presenter.supplierRef,
      internalNotes: presenter.internalNotes,
      targetDeliverablesPerMonth:
        presenter.targetDeliverablesPerMonth,
      capacityWeight: Number(presenter.capacityWeight),
      contracts: presenter.contracts.map((c) => ({
        id: c.id,
        brand: c.brand,
        contractStatus: c.contractStatus,
        contractSignedAt: c.contractSignedAt,
        contractExpiresAt: c.contractExpiresAt,

        // Effective rate = brand override, falling back to the presenter default.
        effectiveRateMinor:
          c.rateMinor ?? presenter.defaultRateMinor,
        effectiveRateUnit:
          c.rateUnit ?? presenter.defaultRateUnit,
        effectiveCurrency:
          c.currency ?? presenter.defaultCurrency,
        rateIsInherited: c.rateMinor === null,
        notes: c.notes,
        contractFile:
          c.attachments.find(
            (a) => a.kind === 'CONTRACT',
          ) ?? null,
      })),
      availability: presenter.availability,
      onboardedAt: presenter.onboardedAt,
      createdAt: presenter.createdAt,
      monthlyDeliverables,
    };

    // A presenter viewing their own profile never sees the internal notes.
    if (viewer?.role === 'PRESENTER') {
      delete dto.internalNotes;
    }

    return dto;
  }

  private toSummary(presenter: any) {
    return {
      id: presenter.id,
      displayName: presenter.displayName,
      fullName: presenter.fullName,
      email: presenter.email,
      photoUrl: presenter.photoUrl,
      status: presenter.status,
      brands:
        presenter.contracts?.map((c: any) => ({
          id: c.brand.id,
          name: c.brand.name,
          colorHex: c.brand.colorHex,
          contractStatus: c.contractStatus,
        })) ?? [],
      tags:
        presenter.tags?.map((t: any) => t.tag) ?? [],
      defaultRateMinor: presenter.defaultRateMinor,
      defaultRateUnit: presenter.defaultRateUnit,
      defaultCurrency: presenter.defaultCurrency,
      activeAssignments:
        presenter._count?.assignments ?? 0,
      completedAssignments:
        presenter.completedAssignments,
      lastAssignedAt: presenter.lastAssignedAt,
      lastCompletedAt: presenter.lastCompletedAt,
      avgTurnaroundMinutes:
        presenter.avgTurnaroundMinutes,
      avgRating:
        presenter.avgRating === null
          ? null
          : Number(presenter.avgRating),
      onTimeDeliveryPct:
        presenter.onTimeDeliveryPct === null
          ? null
          : Number(presenter.onTimeDeliveryPct),
      hasPortalAccess: Boolean(presenter.user?.id),
    };
  }

  /** Rolling 12 months of deliverables + fees, for the profile sparkline. */
  private async monthlyDeliverables(presenterId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        month: Date;
        count: bigint;
        earned: bigint | null;
      }[]
    >`
      SELECT date_trunc('month', COALESCE(a."completedAt", a."submittedAt", a."assignedAt")) AS month,
             SUM(a."deliverableCount")::bigint AS count,
             SUM(COALESCE(a."totalFeeMinor", 0))::bigint AS earned
      FROM "Assignment" a
      WHERE a."presenterId" = ${presenterId}
        AND a."status" NOT IN ('DRAFT','CANCELLED','DECLINED')
        AND COALESCE(a."completedAt", a."submittedAt", a."assignedAt") >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      count: Number(r.count),
      earnedMinor: Number(r.earned ?? 0),
    }));
  }

  // ==========================================================================
  // Denormalised stat maintenance
  // ==========================================================================

  /**
   * Recomputes the cached stats on a presenter from source data.
   *
   * Called after any assignment status change and after new feedback. Also
   * exposed as a script (`npm run recompute:presenter-stats`) so the cache can
   * be rebuilt from scratch if it ever drifts — which is the safety net that
   * makes the denormalisation acceptable.
   */
  async recomputeStats(presenterId: string) {
    const [aggregate, ratingAgg, timing] =
      await this.prisma.$transaction([
        this.prisma.assignment.aggregate({
          where: {
            presenterId,
            status: {
              in: DELIVERED_ASSIGNMENT_STATUSES,
            },
          },
          _count: {
            _all: true,
          },
          _avg: {
            turnaroundMinutes: true,
          },
          _max: {
            completedAt: true,
          },
        }),

        this.prisma.feedback.aggregate({
          where: {
            presenterId,
          },
          _avg: {
            overallRating: true,
          },
        }),

        this.prisma.assignment.findMany({
          where: {
            presenterId,
            submittedAt: {
              not: null,
            },
            dueAt: {
              not: null,
            },
            status: {
              notIn: [
                'CANCELLED',
                'DECLINED',
                'DRAFT',
              ],
            },
          },
          select: {
            latenessMinutes: true,
          },
        }),
      ]);

    const lastAssigned =
      await this.prisma.assignment.findFirst({
        where: {
          presenterId,
          assignedAt: {
            not: null,
          },
        },
        orderBy: {
          assignedAt: 'desc',
        },
        select: {
          assignedAt: true,
        },
      });

    const onTime = timing.filter(
      (t) => (t.latenessMinutes ?? 0) <= 0,
    ).length;

    const onTimePct =
      timing.length > 0
        ? (onTime / timing.length) * 100
        : null;

    await this.prisma.presenter.update({
      where: {
        id: presenterId,
      },
      data: {
        completedAssignments:
          aggregate._count._all,
        avgTurnaroundMinutes:
          aggregate._avg.turnaroundMinutes
            ? Math.round(
                aggregate._avg.turnaroundMinutes,
              )
            : null,
        lastCompletedAt:
          aggregate._max.completedAt,
        lastAssignedAt:
          lastAssigned?.assignedAt ?? null,
        avgRating:
          ratingAgg._avg.overallRating
            ? new Prisma.Decimal(
                ratingAgg._avg.overallRating.toFixed(2),
              )
            : null,
        onTimeDeliveryPct:
          onTimePct === null
            ? null
            : new Prisma.Decimal(
                onTimePct.toFixed(2),
              ),
      },
    });
  }

  // ==========================================================================
  // Availability
  // ==========================================================================

  addAvailability(presenterId: string, input: any) {
    return this.prisma.availability.create({
      data: {
        presenterId,
        type: input.type,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        note: input.note ?? null,
      },
    });
  }

  removeAvailability(id: string) {
    return this.prisma.availability.delete({
      where: {
        id,
      },
    });
  }

  /** True when the presenter has an UNAVAILABLE block covering the date. */
  async isUnavailableOn(
    presenterId: string,
    date: Date,
  ) {
    const clash =
      await this.prisma.availability.findFirst({
        where: {
          presenterId,
          type: 'UNAVAILABLE',
          startDate: {
            lte: date,
          },
          endDate: {
            gte: date,
          },
        },
      });

    return Boolean(clash);
  }
}
