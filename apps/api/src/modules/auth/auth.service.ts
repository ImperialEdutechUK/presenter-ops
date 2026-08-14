async invite(
  input: {
    email: string;
    name: string;
    role: Role;
    presenterId?: string;
  },
  invitedById: string,
) {
  const email = input.email.toLowerCase().trim();

  const existing = await this.prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new BadRequestException(
      'Someone with that email already has an account.',
    );
  }

  if (input.role === 'PRESENTER' && !input.presenterId) {
    throw new BadRequestException(
      'A presenter login has to be linked to a presenter profile. Create the profile first.',
    );
  }

  if (input.presenterId) {
    const presenter = await this.prisma.presenter.findUnique({
      where: { id: input.presenterId },
      select: {
        id: true,
        email: true,
        userId: true,
      },
    });

    if (!presenter) {
      throw new BadRequestException('Presenter profile not found.');
    }

    if (presenter.userId) {
      throw new BadRequestException(
        'This presenter already has portal access.',
      );
    }

    if (presenter.email.toLowerCase().trim() !== email) {
      throw new BadRequestException(
        'The invitation email must match the presenter profile email.',
      );
    }
  }

  const raw = randomBytes(32).toString('base64url');
  const ttlDays = this.config.get<number>('auth.inviteTtlDays')!;
  const expiresAt = new Date(
    Date.now() + ttlDays * 86_400_000,
  );

  const invitation = await this.prisma.$transaction(async (tx) => {
    // A new invite invalidates any previous presenter invite.
    // This makes "resend invitation" safe and ensures only the newest link works.
    if (input.presenterId) {
      await tx.invitation.deleteMany({
        where: {
          presenterId: input.presenterId,
        },
      });
    }

    return tx.invitation.create({
      data: {
        email,
        role: input.role,
        presenterId: input.presenterId ?? null,
        tokenHash: sha256(raw),
        invitedById,
        expiresAt,
      },
    });
  });

  const url =
    `${this.config.get<string>('appUrl')}` +
    `/accept-invite?token=${raw}`;

  const emailSent = await this.notifications.sendEmail({
    to: email,
    subject: `You have been invited to ${
      process.env.ORG_NAME ?? 'PresenterOps'
    }`,
    text:
      `Hello ${input.name},\n\n` +
      `You have been given access to the presenter management system.\n\n` +
      `Set your password here (the link is valid for ${ttlDays} days):\n${url}\n`,
  });

  return {
    id: invitation.id,
    email,
    expiresAt: invitation.expiresAt,
    emailSent,
    ...(this.config.get('env') === 'development'
      ? { devToken: raw }
      : {}),
  };
}
