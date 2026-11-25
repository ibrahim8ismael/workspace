import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MeetingScreenShareViewer } from '../src/features/office/meeting-screen-share-viewer';
import type { ProximityRemoteScreenShare } from '../src/features/office/proximity-audio-session';

const presentation = {
  shareId: '99999999-9999-4999-8999-999999999999',
  presenterParticipationId: '55555555-5555-4555-8555-555555555555',
  status: 'live' as const,
  startedAt: 100,
};

describe('meeting screen-share viewer', () => {
  it('renders the presenter and active video only for the matching subscribed track', () => {
    const matching = {
      identity: presentation.presenterParticipationId,
      track: { attach: () => document.createElement('video'), detach: () => [] },
    } as ProximityRemoteScreenShare;
    const other = {
      identity: '44444444-4444-4444-8444-444444444444',
      track: { attach: () => document.createElement('video'), detach: () => [] },
    } as ProximityRemoteScreenShare;
    const html = renderToStaticMarkup(
      createElement(MeetingScreenShareViewer, {
        presentation,
        presenterName: 'Office Teammate',
        remoteScreenShares: [other, matching],
      }),
    );

    expect(html).toContain('Office Teammate');
    expect(html).toContain('is sharing a screen');
    expect(html).toContain('aria-label="Office Teammate&#x27;s shared screen"');
    expect(html).toContain('<video');
    expect(html).toContain('playsInline=""');
  });

  it('shows starting status without creating a video before a live subscribed track exists', () => {
    const html = renderToStaticMarkup(
      createElement(MeetingScreenShareViewer, {
        presentation: { ...presentation, status: 'starting' },
        presenterName: 'Office Teammate',
        remoteScreenShares: [],
      }),
    );
    expect(html).toContain('is preparing a screen share');
    expect(html).toContain('Waiting for the presentation to start');
    expect(html).not.toContain('<video');
  });
});
