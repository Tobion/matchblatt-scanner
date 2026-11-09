import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Rosters } from '../domain/model';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { sheetSchema, type RecognizedSheet } from './schema';
import { RecognitionError } from './errors';

export type Effort = 'low' | 'medium' | 'high';
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface RecognitionOptions {
  apiKey: string;
  model: string;
  effort: Effort;
}

export interface RecognitionInput {
  imageBase64: string;
  mediaType: ImageMediaType;
  rosters: Rosters;
}

export interface RecognitionResult {
  sheet: RecognizedSheet;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export { RecognitionError };

/** SDK client for the user's own key, used from the extension (browser) and Node. */
export function createClient(apiKey: string, options: { maxRetries?: number } = {}): Anthropic {
  return new Anthropic({
    apiKey,
    // Sends the "anthropic-dangerous-direct-browser-access" header that Anthropic
    // requires for browser requests. The key belongs to the user and never
    // leaves their own browser.
    dangerouslyAllowBrowser: true,
    ...options,
  });
}

export async function recognizeSheet(
  input: RecognitionInput,
  options: RecognitionOptions,
): Promise<RecognitionResult> {
  const client = createClient(options.apiKey);

  try {
    const message = await client.beta.messages.parse({
      model: options.model,
      max_tokens: 16000,
      // Re-run on Anthropic's recommended fallback model if a safety classifier declines.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: {
        effort: options.effort,
        format: betaZodOutputFormat(sheetSchema),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 } },
            { type: 'text', text: buildUserPrompt(input.rosters) },
          ],
        },
      ],
    });

    if (message.stop_reason === 'refusal') {
      throw new RecognitionError('Die KI hat die Auswertung des Fotos abgelehnt.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new RecognitionError('Die Antwort der KI war unvollständig. Bitte nochmals versuchen.');
    }
    if (!message.parsed_output) {
      throw new RecognitionError('Die Antwort der KI konnte nicht gelesen werden. Bitte nochmals versuchen.');
    }
    return {
      sheet: message.parsed_output,
      model: message.model,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  } catch (error) {
    throw toRecognitionError(error);
  }
}

/** Error text of the API response, useful to tell e.g. an invalid from a disabled key. */
function apiErrorDetail(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? `HTTP ${error.status}`;
}

/**
 * Normalizes a pasted key: removes whitespace, surrounding quotes and a
 * copied "ANTHROPIC_API_KEY=" prefix.
 */
export function cleanApiKey(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/^(?:export)?ANTHROPIC_API_KEY=/i, '')
    .replace(/^["']|["']$/g, '');
}

export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

/**
 * Minimal Messages API request (same endpoint as the recognition, costs a
 * fraction of a cent) to check that the key is accepted.
 */
export async function verifyApiKey(apiKey: string): Promise<void> {
  const client = createClient(apiKey, { maxRetries: 0 });
  try {
    await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 16,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'Antworte mit OK.' }],
    });
  } catch (error) {
    throw toRecognitionError(error);
  }
}

function toRecognitionError(error: unknown): Error {
  if (error instanceof RecognitionError) return error;
  if (error instanceof Anthropic.APIError && /custom retention/i.test(apiErrorDetail(error))) {
    return new RecognitionError(
      'Deine Anthropic-Organisation hat eine besondere Datenaufbewahrung eingestellt (z.B. „Zero Data Retention“). ' +
        'Dafür lässt Anthropic keine Anfragen aus dem Browser zu. Bitte einen API-Key aus einer Organisation ' +
        'ohne diese Einstellung verwenden.',
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new RecognitionError(
      `Der Claude-API-Key wurde abgelehnt (${apiErrorDetail(error)}). Bitte in den Einstellungen der Erweiterung prüfen.`,
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new RecognitionError('Der API-Key hat keine Berechtigung für dieses Modell.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RecognitionError('Zu viele Anfragen an die KI. Bitte in einer Minute nochmals versuchen.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new RecognitionError(`Die KI hat die Anfrage abgelehnt: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RecognitionError('Keine Verbindung zur KI. Bitte Internetverbindung prüfen.');
  }
  if (error instanceof Anthropic.APIError) {
    return new RecognitionError(`Fehler der KI-Schnittstelle (${error.status ?? 'unbekannt'}). Bitte später nochmals versuchen.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
