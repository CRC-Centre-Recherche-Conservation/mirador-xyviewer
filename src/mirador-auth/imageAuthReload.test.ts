import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub Mirador's info-response action creators (avoid pulling the heavy bundle).
vi.mock('mirador', () => ({
  removeInfoResponse: (infoId: string) => ({ type: 'REMOVE_INFO_RESPONSE', infoId }),
  requestInfoResponse: (infoId: string) => ({ type: 'REQUEST_INFO_RESPONSE', infoId }),
}));

import { selectNewlyAuthedInfoIds, wireMiradorImageAuthReload } from './imageAuthReload';

const flush = () => Promise.resolve();

describe('selectNewlyAuthedInfoIds', () => {
  it('detects an info response that went degraded -> authed (and carries json)', () => {
    const prev = new Map([['img', true]]);
    expect(selectNewlyAuthedInfoIds(prev, { img: { degraded: false, json: {} } })).toEqual(['img']);
  });

  it('ignores one that is still degraded', () => {
    const prev = new Map([['img', true]]);
    expect(selectNewlyAuthedInfoIds(prev, { img: { degraded: true, json: {} } })).toEqual([]);
  });

  it('ignores one that was never degraded (authed from the start loads on its own)', () => {
    expect(selectNewlyAuthedInfoIds(new Map(), { img: { degraded: false, json: {} } })).toEqual([]);
  });

  it('ignores the transition until the json is present', () => {
    const prev = new Map([['img', true]]);
    expect(selectNewlyAuthedInfoIds(prev, { img: { degraded: false } })).toEqual([]);
  });
});

describe('wireMiradorImageAuthReload', () => {
  let state: { infoResponses: Record<string, { degraded?: boolean; json?: unknown }> };
  let listener: () => void;
  const dispatch = vi.fn();
  const store = {
    getState: () => state,
    dispatch,
    subscribe: (l: () => void) => {
      listener = l;
      return () => {};
    },
  };

  beforeEach(() => {
    dispatch.mockClear();
    state = { infoResponses: {} };
  });

  it('remounts the tile source (remove + re-request) when an image becomes authed', async () => {
    wireMiradorImageAuthReload(store);

    // Tick 1: the image is degraded (awaiting login) — nothing to do.
    state = { infoResponses: { img: { degraded: true, json: {} } } };
    listener();
    expect(dispatch).not.toHaveBeenCalled();

    // Tick 2: login resolved, Mirador flipped it to authed -> force the OSD remount.
    state = { infoResponses: { img: { degraded: false, json: {} } } };
    listener();
    await flush();

    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_INFO_RESPONSE', infoId: 'img' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'REQUEST_INFO_RESPONSE', infoId: 'img' });
  });

  it('does not reload a public image that was authed from the first tick', async () => {
    wireMiradorImageAuthReload(store);
    state = { infoResponses: { pub: { degraded: false, json: {} } } };
    listener();
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not loop: the remove/re-request cycle is not re-detected as a new transition', async () => {
    wireMiradorImageAuthReload(store);
    state = { infoResponses: { img: { degraded: true, json: {} } } };
    listener();
    state = { infoResponses: { img: { degraded: false, json: {} } } };
    listener();
    await flush();
    dispatch.mockClear();

    // Mirador removes it, then re-requests (isFetching), then re-receives it authed.
    state = { infoResponses: {} };
    listener();
    state = { infoResponses: { img: { /* isFetching, no degraded key */ json: undefined } } };
    listener();
    state = { infoResponses: { img: { degraded: false, json: {} } } };
    listener();
    await flush();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
