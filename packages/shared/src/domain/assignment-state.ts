import type { AssignmentStatus, Role } from '../enums';

/**
 * The assignment state machine.
 *
 * Kept in the shared package so the API enforces it and the web app can grey
 * out buttons for transitions that would be rejected — the client never has to
 * guess, and the two can never disagree.
 */

export interface TransitionRule {
  to: AssignmentStatus;
  /** Roles allowed to make this move. */
  allowedRoles: Role[];
  /** Label for the button that performs it. */
  label: string;
  /** Fields that must be present on the assignment before the move is legal. */
  requires?: ('presenterId' | 'dueAt' | 'feeMinor' | 'deliveryUrl')[];
  /** Shown in the confirmation dialog. */
  description?: string;
  /** Marks the destructive/negative path so the UI can style it. */
  tone?: 'default' | 'positive' | 'caution' | 'destructive';
}

const INTERNAL: Role[] = ['ADMIN', 'PRODUCER'];
const INTERNAL_PLUS_MARKETING: Role[] = ['ADMIN', 'PRODUCER', 'MARKETING'];

export const TRANSITIONS: Record<AssignmentStatus, TransitionRule[]> = {
  DRAFT: [
    {
      to: 'ASSIGNED',
      allowedRoles: INTERNAL,
      label: 'Send to presenter',
      requires: ['presenterId', 'dueAt', 'feeMinor'],
      description:
        'Notifies the presenter and starts the clock. Turnaround is measured from this moment.',
      tone: 'positive',
    },
    { to: 'CANCELLED', allowedRoles: INTERNAL, label: 'Discard', tone: 'destructive' },
  ],
  ASSIGNED: [
    {
      to: 'ACCEPTED',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Accept',
      tone: 'positive',
    },
    {
      to: 'DECLINED',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Decline',
      description: 'Frees the assignment so it can be offered to someone else.',
      tone: 'caution',
    },
    { to: 'CANCELLED', allowedRoles: INTERNAL, label: 'Cancel', tone: 'destructive' },
  ],
  ACCEPTED: [
    {
      to: 'IN_PROGRESS',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Start work',
    },
    { to: 'CANCELLED', allowedRoles: INTERNAL, label: 'Cancel', tone: 'destructive' },
  ],
  IN_PROGRESS: [
    {
      to: 'SUBMITTED',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Submit delivery',
      requires: ['deliveryUrl'],
      description: 'Paste the OneDrive or SharePoint link to the finished files.',
      tone: 'positive',
    },
    { to: 'CANCELLED', allowedRoles: INTERNAL, label: 'Cancel', tone: 'destructive' },
  ],
  SUBMITTED: [
    { to: 'IN_REVIEW', allowedRoles: INTERNAL_PLUS_MARKETING, label: 'Start review' },
    {
      to: 'REVISIONS_REQUESTED',
      allowedRoles: INTERNAL_PLUS_MARKETING,
      label: 'Request revisions',
      tone: 'caution',
    },
    { to: 'APPROVED', allowedRoles: INTERNAL_PLUS_MARKETING, label: 'Approve', tone: 'positive' },
  ],
  IN_REVIEW: [
    {
      to: 'REVISIONS_REQUESTED',
      allowedRoles: INTERNAL_PLUS_MARKETING,
      label: 'Request revisions',
      tone: 'caution',
    },
    { to: 'APPROVED', allowedRoles: INTERNAL_PLUS_MARKETING, label: 'Approve', tone: 'positive' },
  ],
  REVISIONS_REQUESTED: [
    {
      to: 'IN_PROGRESS',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Resume work',
    },
    {
      to: 'SUBMITTED',
      allowedRoles: ['ADMIN', 'PRODUCER', 'PRESENTER'],
      label: 'Resubmit',
      requires: ['deliveryUrl'],
      tone: 'positive',
    },
    { to: 'CANCELLED', allowedRoles: INTERNAL, label: 'Cancel', tone: 'destructive' },
  ],
  APPROVED: [
    {
      to: 'COMPLETED',
      allowedRoles: ['ADMIN', 'PRODUCER', 'FINANCE'],
      label: 'Mark complete',
      description: 'Use once the video is published and the fee is cleared for payment.',
      tone: 'positive',
    },
    {
      to: 'REVISIONS_REQUESTED',
      allowedRoles: INTERNAL,
      label: 'Reopen for revisions',
      tone: 'caution',
    },
  ],
  COMPLETED: [],
  DECLINED: [
    {
      to: 'DRAFT',
      allowedRoles: INTERNAL,
      label: 'Reassign',
      description: 'Clears the presenter and returns the brief to draft so you can offer it on.',
    },
  ],
  CANCELLED: [],
};

export function allowedTransitions(
  from: AssignmentStatus,
  role: Role,
): TransitionRule[] {
  return (TRANSITIONS[from] ?? []).filter((t) => t.allowedRoles.includes(role));
}

export function canTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
  role: Role,
): boolean {
  return allowedTransitions(from, role).some((t) => t.to === to);
}

/** Returns the list of missing required fields, empty if the move is legal. */
export function missingRequirements(
  from: AssignmentStatus,
  to: AssignmentStatus,
  assignment: Record<string, unknown>,
): string[] {
  const rule = (TRANSITIONS[from] ?? []).find((t) => t.to === to);
  if (!rule?.requires) return [];
  return rule.requires.filter((field) => {
    const value = assignment[field];
    return value === null || value === undefined || value === '';
  });
}

/**
 * Ordered stages shown in the progress rail on the assignment detail page.
 * Terminal negative statuses are not stages — they replace the rail.
 */
export const PIPELINE_STAGES: AssignmentStatus[] = [
  'DRAFT',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'COMPLETED',
];
