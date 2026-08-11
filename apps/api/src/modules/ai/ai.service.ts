import { BadRequestException, Injectable } from '@nestjs/common';

import { OpenRouterClient } from './openrouter.client';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import type { AuthenticatedUser } from '../../common/decorators';

/**
 * Optional AI assistance, off by default (AI_ENABLED=false).
 *
 * Three rules this module follows, and the frontend enforces visually:
 *   1. Nothing generated here is ever written to a record automatically. Every
 *      response comes back as a DRAFT the human accepts, edits or discards.
 *   2. Every AI-produced block is labelled as such in the UI.
 *   3. Nothing here scores or ranks a presenter. The suggestion engine in
 *      AnalyticsService is a fixed formula precisely so that "why is she top
 *      of the list" always has an answer that does not involve a model.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly openRouter: OpenRouterClient,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  get enabled() {
    return this.openRouter.enabled;
  }

  /**
   * Reads a script attachment and drafts the presenter-facing brief: a summary,
   * an estimated read time, the tricky pronunciations, and a shot checklist.
   */
  async briefFromScript(assignmentId: string, attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    if (attachment.assignmentId !== assignmentId) {
      throw new BadRequestException('That file is not attached to this assignment.');
    }

    const text = await this.extractText(attachmentId, actor);
    if (!text.trim()) {
      throw new BadRequestException(
        'No readable text could be extracted from that file. Plain text, DOCX and text-layer PDFs work; scanned images do not.',
      );
    }

    const result = await this.openRouter.complete({
      system:
        'You prepare briefing notes for freelance video presenters. Be concise and practical. ' +
        'Never invent facts that are not in the script. If something is ambiguous, say so ' +
        'explicitly rather than guessing.',
      user:
        'From the script below produce, in markdown:\n' +
        '1. A two-sentence summary of what the video covers.\n' +
        '2. Estimated spoken duration, stating the words-per-minute figure you used.\n' +
        '3. Any names, acronyms or technical terms the presenter may mispronounce.\n' +
        '4. A short checklist of anything the presenter needs on camera or on screen.\n' +
        '5. Anything ambiguous or missing that the producer should clarify.\n\n' +
        `SCRIPT:\n"""\n${text.slice(0, 40_000)}\n"""`,
    });

    return {
      draft: result.text,
      model: result.model,
      disclaimer:
        'Generated from the attached script. Check it before sending — it is a draft, not a fact.',
    };
  }

  /**
   * Summarises a presenter's feedback history into themes. Refuses to run on a
   * small sample, because "3 reviews" is not a pattern and presenting it as one
   * would be misleading.
   */
  async summariseFeedback(presenterId: string, months: number) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const feedback = await this.prisma.feedback.findMany({
      where: { presenterId, createdAt: { gte: since }, comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { overallRating: true, comment: true, createdAt: true },
    });

    if (feedback.length < 5) {
      throw new BadRequestException(
        `Only ${feedback.length} written review(s) in the last ${months} months. ` +
          'A summary of that few would read as a pattern when it is not — read them directly instead.',
      );
    }

    const corpus = feedback
      .map((f) => `[${f.createdAt.toISOString().slice(0, 10)}] ${f.overallRating}/5 — ${f.comment}`)
      .join('\n');

    const result = await this.openRouter.complete({
      system:
        'You summarise internal reviews of freelance presenters for the producer who books them. ' +
        'Report only what the reviews actually say. Do not soften criticism and do not amplify it. ' +
        'If the reviews disagree, say they disagree rather than picking a side.',
      user:
        'Summarise these reviews into: (a) consistent strengths, (b) recurring issues, ' +
        '(c) anything reviewers disagree about, (d) whether the pattern is improving, ' +
        'worsening or flat over time. Quote briefly where it helps. State the number of ' +
        'reviews you are working from.\n\n' +
        `REVIEWS (${feedback.length} total):\n${corpus.slice(0, 30_000)}`,
    });

    return {
      draft: result.text,
      sampleSize: feedback.length,
      periodMonths: months,
      model: result.model,
      disclaimer: `Based on ${feedback.length} written reviews from the last ${months} months. Internal use only — this is not a shareable appraisal.`,
    };
  }

  /** Drafts the message that goes out with a new assignment. */
  async draftAssignmentMessage(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { brand: true, presenter: true, workType: true },
    });

    const result = await this.openRouter.complete({
      system:
        'You write short, warm, professional briefing messages to freelance presenters in ' +
        'British English. No filler, no exclamation marks, no emoji. Under 150 words.',
      user:
        `Write a message offering this job.\n` +
        `Presenter: ${assignment.presenter?.displayName ?? 'the presenter'}\n` +
        `Brand: ${assignment.brand.name}\n` +
        `Job: ${assignment.title}\n` +
        `Type: ${assignment.workType?.name ?? 'video'}\n` +
        `Deliverables: ${assignment.deliverableCount}\n` +
        `Due: ${assignment.dueAt?.toDateString() ?? 'to be agreed'}\n` +
        `Brief: ${assignment.description?.slice(0, 2000) ?? '(none supplied)'}\n\n` +
        'Do not mention the fee — that is shown separately in the portal.',
    });

    return { draft: result.text, model: result.model };
  }

  /**
   * Text extraction. Plain text and markdown work directly. DOCX and PDF need
   * a parser, which is deliberately left as an explicit TODO rather than a
   * silent failure — see docs/08-ai-module.md for the two-line change.
   */
  private async extractText(attachmentId: string, actor: AuthenticatedUser): Promise<string> {
    const attachment = await this.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });

    if (attachment.storage === 'EXTERNAL_LINK') {
      throw new BadRequestException(
        'This script is a OneDrive link rather than an uploaded file, so its text cannot be read. Upload the script to use this.',
      );
    }

    const { url } = await this.files.getDownloadUrl(attachmentId, actor);
    const response = await fetch(url!);
    const buffer = Buffer.from(await response.arrayBuffer());

    const mime = attachment.mimeType ?? '';
    if (mime.startsWith('text/') || mime === 'application/json') {
      return buffer.toString('utf8');
    }

    // TODO(handover): add `mammoth` for .docx and `pdf-parse` for .pdf here.
    // Both are small, synchronous and well maintained; they are left out of
    // package.json so the dependency is a conscious decision, not inherited.
    throw new BadRequestException(
      `Text extraction for ${mime || 'this file type'} is not wired up yet. ` +
        'Plain text works today; see docs/08-ai-module.md to enable DOCX and PDF.',
    );
  }
}
