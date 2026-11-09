import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyApiKey } from '../src/recognition/claude';

describe('createClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the key and the browser access header required by Anthropic', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await verifyApiKey('sk-ant-test-key-0123456789abcdefghij');

    expect(fetchMock).toHaveBeenCalledOnce();
    const headers = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-ant-test-key-0123456789abcdefghij');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
  });

  it('explains the rejection for organizations with custom data retention', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'CORS requests are not allowed for this Organization because of custom retention settings.',
          },
        },
        { status: 401 },
      ),
    );
    await expect(verifyApiKey('sk-ant-test-key-0123456789abcdefghij')).rejects.toThrow(/Datenaufbewahrung/);
  });
});
