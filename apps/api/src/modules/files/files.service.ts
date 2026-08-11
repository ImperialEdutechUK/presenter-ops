import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';
import type { AuthenticatedUser } from '../../common/decorators';

const PREFIX_BY_KIND: Record<string, string> = {
  SCRIPT: 'scripts',
  BRIEF: 'briefs',
  REFERENCE: 'references',
  CONTRACT: 'contracts',
  DELIVERABLE: 'deliverables',
  INVOICE: 'invoices',
  OTHER: 'misc',
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  presign(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    kind: string;
  }) {
    const key = this.storage.buildKey(PREFIX_BY_KIND[input.kind] ?? 'misc', input.fileName);
    return this.storage.presignUpload(key, input.mimeType, input.sizeBytes);
  }

  /**
   * Called after the browser has finished the direct-to-bucket PUT.
   *
   * Script versioning: pass the versionGroupId of the file being replaced and
   * the previous version is marked `isCurrent: false` rather than deleted, so
   * you can always see what the presenter was originally given.
   */
  async confirm(input: any, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      let version = 1;
      const versionGroupId = input.versionGroupId ?? randomUUID();

      if (input.versionGroupId) {
        const previous = await tx.attachment.findFirst({
          where: { versionGroupId: input.versionGroupId },
          orderBy: { version: 'desc' },
        });
        version = (previous?.version ?? 0) + 1;
        await tx.attachment.updateMany({
          where: { versionGroupId: input.versionGroupId },
          data: { isCurrent: false },
        });
      }

      const attachment = await tx.attachment.create({
        data: {
          kind: input.kind,
          storage: 'S3',
          fileName: input.fileName,
          mimeType: input.mimeType ?? null,
          sizeBytes: input.sizeBytes ?? null,
          storageKey: input.storageKey,
          assignmentId: input.assignmentId ?? null,
          presenterBrandId: input.presenterBrandId ?? null,
          version,
          versionGroupId,
          isCurrent: true,
          visibleToPresenter: input.visibleToPresenter ?? true,
          uploadedById: actor.id,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });

      if (input.assignmentId) {
        await tx.assignmentEvent.create({
          data: {
            assignmentId: input.assignmentId,
            actorId: actor.id,
            type: 'ATTACHMENT_ADDED',
            payload: { fileName: input.fileName, kind: input.kind, version },
          },
        });
      }

      return attachment;
    });
  }

  /**
   * Records a OneDrive / SharePoint link. This is how finished videos are
   * attached — we deliberately do not hold the video bytes (see
   * docs/02-architecture.md §"Why we do not store video").
   */
  async link(input: any, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.create({
      data: {
        kind: input.kind,
        storage: 'EXTERNAL_LINK',
        fileName: input.fileName,
        externalUrl: input.externalUrl,
        assignmentId: input.assignmentId ?? null,
        presenterBrandId: input.presenterBrandId ?? null,
        visibleToPresenter: input.visibleToPresenter ?? true,
        uploadedById: actor.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    if (input.assignmentId) {
      await this.prisma.assignmentEvent.create({
        data: {
          assignmentId: input.assignmentId,
          actorId: actor.id,
          type: 'ATTACHMENT_ADDED',
          payload: { fileName: input.fileName, kind: input.kind, external: true },
        },
      });
    }
    return attachment;
  }

  /** Returns a short-lived url. Presenters can only reach their own files. */
  async getDownloadUrl(attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { assignment: { select: { presenterId: true } } },
    });
    if (!attachment) throw new NotFoundException('File not found.');

    if (actor.role === 'PRESENTER') {
      const ownsIt = attachment.assignment?.presenterId === actor.presenterId;
      if (!ownsIt || !attachment.visibleToPresenter) {
        throw new ForbiddenException('You do not have access to this file.');
      }
    }

    if (attachment.storage === 'EXTERNAL_LINK') {
      return { url: attachment.externalUrl, external: true };
    }
    return {
      url: await this.storage.presignDownload(attachment.storageKey!, attachment.fileName),
      external: false,
    };
  }

  async remove(attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    if (!['ADMIN', 'PRODUCER', 'MARKETING'].includes(actor.role)) {
      throw new ForbiddenException('Your role cannot remove files.');
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    if (attachment.storageKey) await this.storage.delete(attachment.storageKey);

    if (attachment.assignmentId) {
      await this.prisma.assignmentEvent.create({
        data: {
          assignmentId: attachment.assignmentId,
          actorId: actor.id,
          type: 'ATTACHMENT_REMOVED',
          payload: { fileName: attachment.fileName },
        },
      });
    }
    return { ok: true };
  }
}
