import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Rosters } from '../domain/model';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { sheetSchema, type RecognizedSheet } from './schema';

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

/** Error with a message suitable for showing to the user (German UI). */
export class RecognitionError extends Error {}

export async function recognizeSheet(
  input: RecognitionInput,
  options: RecognitionOptions,
): Promise<RecognitionResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    // The key belongs to the user and never leaves their own browser.
    dangerouslyAllowBrowser: true,
  });

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

function toRecognitionError(error: unknown): Error {
  if (error instanceof RecognitionError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new RecognitionError('Der Claude-API-Key ist ungültig. Bitte in den Einstellungen der Erweiterung prüfen.');
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
