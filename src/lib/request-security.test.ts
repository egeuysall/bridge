import { describe, expect, it } from 'bun:test';

import {
  hasBridgeApiKeyAuthorization,
  readBridgeApiKeyFromRequest,
  rejectCookieBackedCrossOriginMutation,
  type BridgeApiKeyAuth,
} from './request-security';

const cookieAuth: BridgeApiKeyAuth = {
  apiKey: 'bri_test.secret',
  source: 'cookie',
};

describe('browser API-key request security', () => {
  it('keeps bearer parsing header-only', () => {
    expect(
      readBridgeApiKeyFromRequest(
        new Request('https://bri.test/api/notes', {
          headers: { authorization: 'Bearer bri_test.secret' },
        }),
      ),
    ).toBe('bri_test.secret');
    expect(
      readBridgeApiKeyFromRequest(
        new Request('https://bri.test/api/notes', {
          headers: { cookie: 'bri_api_key_session=sealed' },
        }),
      ),
    ).toBeNull();
  });

  it('recognizes Bri bearer requests before Clerk auth runs', () => {
    expect(
      hasBridgeApiKeyAuthorization(
        new Request('https://bri.test/api/notes', {
          headers: { authorization: 'Bearer bri_test.secret' },
        }),
      ),
    ).toBe(true);
    expect(
      hasBridgeApiKeyAuthorization(
        new Request('https://bri.test/api/notes', {
          headers: { authorization: 'Bearer eyJ.not-a-bri-key' },
        }),
      ),
    ).toBe(false);
  });

  it('requires same-origin browser signals for cookie mutations', () => {
    expect(
      rejectCookieBackedCrossOriginMutation(
        new Request('https://bri.test/api/notes', { method: 'POST' }),
        cookieAuth,
      )?.status,
    ).toBe(403);
    expect(
      rejectCookieBackedCrossOriginMutation(
        new Request('https://bri.test/api/notes', {
          method: 'POST',
          headers: { origin: 'https://bri.test' },
        }),
        cookieAuth,
      ),
    ).toBeNull();
    expect(
      rejectCookieBackedCrossOriginMutation(
        new Request('https://bri.test/api/notes', {
          method: 'POST',
          headers: { origin: 'https://evil.test' },
        }),
        cookieAuth,
      )?.status,
    ).toBe(403);
  });
});
