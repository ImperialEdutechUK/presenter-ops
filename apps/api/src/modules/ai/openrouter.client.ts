import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin OpenRouter client.
 *
 * Endpoint and payload verified against OpenRouter's published API reference:
 * POST https://openrouter.ai/api/v1/chat/completions with an OpenAI-compatible
 * body ({ model, messages, max_tokens, temperature, stream }), Bearer auth.
 * Source: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
 *
 * Deliberately dependency-free — Node 20's global fetch is enough, and adding
 * an SDK for four fields is not worth the upgrade treadmill.
 */
@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<boolean>('ai.enabled') && this.config.get<string>('ai.apiKey'));
  }

  async complete(params: {
    system: string;
    user: string;
    /** Overrides the default model for this one call. */
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ text: string; model: string; usage: unknown }> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'AI features are switched off. Set AI_ENABLED=true and OPENROUTER_API_KEY to use them.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get<number>('ai.timeoutMs')!,
    );

    try {
      const response = await fetch(`${this.config.get<string>('ai.baseUrl')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.get<string>('ai.apiKey')}`,
          'Content-Type': 'application/json',
          // Optional attribution headers OpenRouter uses for its rankings.
          'HTTP-Referer': this.config.get<string>('ai.siteUrl')!,
          'X-Title': this.config.get<string>('ai.siteName')!,
        },
        body: JSON.stringify({
          model: params.model ?? this.config.get<string>('ai.model'),
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.user },
          ],
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens ?? this.config.get<number>('ai.maxTokens'),
          stream: false,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.error(`OpenRouter ${response.status}: ${detail.slice(0, 500)}`);
        throw new ServiceUnavailableException(
          'The AI service did not respond successfully. Try again, or carry on without it.',
        );
      }

      const json = (await response.json()) as {
        model: string;
        usage: unknown;
        choices: { message: { content: string } }[];
      };

      return {
        text: json.choices?.[0]?.message?.content ?? '',
        model: json.model,
        usage: json.usage,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('The AI service timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
