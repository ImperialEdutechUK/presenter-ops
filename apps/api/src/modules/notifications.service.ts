async sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!this.transporter) {
    this.logger.log(
      `[mail disabled] to=${message.to} subject="${message.subject}"`,
    );
    return false;
  }

  try {
    await this.transporter.sendMail({
      from: this.config.get<string>('mail.from'),
      ...message,
    });

    return true;
  } catch (error) {
    this.logger.error(
      `Email to ${message.to} failed: ${(error as Error).message}`,
    );

    return false;
  }
}
