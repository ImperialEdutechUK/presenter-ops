import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';
import type { NameOrId } from '@presenter-ops/shared';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Brands, work types and tags are all "type it and it exists" lists.
 *
 * The rule the user asked for — "rather than a dropdown, a text field" — is
 * implemented as a combobox that searches existing values as you type and
 * offers `Create "Selector"` as the last option. That needs a resolver that
 * accepts EITHER an id (picked from the list) OR a name (typed fresh), which
 * is what `resolveBrand` / `resolveWorkType` / `resolveTags` do.
 *
 * Duplicate protection is by SLUG, not by raw name, so "South London College",
 * "south london college" and "South London  College" all resolve to one row
 * instead of quietly creating three brands that then split the reporting.
 */

const PALETTE = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0D9488',
  '#0284C7',
  '#4F46E5',
];

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(name: string): string {
    return slugify(name.trim().replace(/\s+/g, ' '), { lower: true, strict: true });
  }

  /** Deterministic colour so a new brand looks intentional, not random. */
  private colourFor(slug: string): string {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
    return PALETTE[hash % PALETTE.length];
  }

  // -------------------------------------------------------------------------
  // Brands
  // -------------------------------------------------------------------------

  listBrands(params: { q?: string; includeInactive?: boolean } = {}) {
    return this.prisma.brand.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { contracts: true, assignments: true } },
      },
    });
  }

  /**
   * Resolve a NameOrId to a brand id, creating the brand if it is new.
   * Runs inside the caller's transaction when one is supplied, so a failed
   * presenter save does not leave an orphan brand behind.
   */
  async resolveBrand(input: NameOrId, tx: Prisma.TransactionClient = this.prisma): Promise<string> {
    if ('id' in input) return input.id;

    const slug = this.slug(input.name);
    const existing = await tx.brand.findUnique({ where: { slug } });
    if (existing) return existing.id;

    const created = await tx.brand.create({
      data: {
        name: input.name.trim().replace(/\s+/g, ' '),
        slug,
        colorHex: this.colourFor(slug),
      },
    });
    return created.id;
  }

  async updateBrand(id: string, data: Record<string, unknown>) {
    const patch: Record<string, unknown> = { ...data };
    if (typeof data.name === 'string') patch.slug = this.slug(data.name);
    if (data.websiteUrl === '') patch.websiteUrl = null;
    return this.prisma.brand.update({ where: { id }, data: patch });
  }

  /**
   * Brands are never hard-deleted — assignments reference them and the history
   * has to stay intact. Archiving hides them from every picker instead.
   */
  archiveBrand(id: string) {
    return this.prisma.brand.update({ where: { id }, data: { isActive: false } });
  }

  /** Merges `sourceId` into `targetId`. Used when a duplicate slips through. */
  async mergeBrands(sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new Error('Cannot merge a brand into itself');

    return this.prisma.$transaction(async (tx) => {
      await tx.assignment.updateMany({ where: { brandId: sourceId }, data: { brandId: targetId } });

      // A presenter may already hold a contract for the target brand, in which
      // case the duplicate link is dropped rather than violating the unique key.
      const sourceLinks = await tx.presenterBrand.findMany({ where: { brandId: sourceId } });
      for (const link of sourceLinks) {
        const clash = await tx.presenterBrand.findUnique({
          where: { presenterId_brandId: { presenterId: link.presenterId, brandId: targetId } },
        });
        if (clash) await tx.presenterBrand.delete({ where: { id: link.id } });
        else await tx.presenterBrand.update({ where: { id: link.id }, data: { brandId: targetId } });
      }

      await tx.brand.update({ where: { id: sourceId }, data: { isActive: false } });
      return tx.brand.findUniqueOrThrow({ where: { id: targetId } });
    });
  }

  // -------------------------------------------------------------------------
  // Work types
  // -------------------------------------------------------------------------

  listWorkTypes(includeInactive = false) {
    return this.prisma.workType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async resolveWorkType(
    input: NameOrId | null | undefined,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    if (!input) return null;
    if ('id' in input) return input.id;

    const slug = this.slug(input.name);
    const existing = await tx.workType.findUnique({ where: { slug } });
    if (existing) return existing.id;

    const created = await tx.workType.create({ data: { name: input.name.trim(), slug } });
    return created.id;
  }

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  listTags(q?: string) {
    return this.prisma.tag.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async resolveTags(
    inputs: NameOrId[] = [],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const input of inputs) {
      if ('id' in input) {
        ids.push(input.id);
        continue;
      }
      const slug = this.slug(input.name);
      const existing = await tx.tag.findUnique({ where: { slug } });
      ids.push(existing ? existing.id : (await tx.tag.create({ data: { name: input.name.trim(), slug } })).id);
    }
    return ids;
  }
}
