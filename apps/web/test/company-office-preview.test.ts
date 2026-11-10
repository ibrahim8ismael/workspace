import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCommonsSceneCleanup } from '../commons-preview/scene-lifecycle';
import type { OfficeWorkspaceDetail } from '../src/lib/api';
import { canOpenOfficePreview } from '../src/features/workspaces/company-overview-view';
import { CompanyOfficePreview } from '../src/features/workspaces/CompanyOfficePreview';
import { ApiClient } from '../src/lib/api';
import type { AccountDto } from '@gather/contracts';
import ChatView from '../chat/ChatView';
import { language, setLanguage } from '../i18n';

vi.mock('../VivoScene', () => ({
  default: () => createElement('div', { 'data-testid': 'openoffice-vivo-scene' }),
}));

const workspaceId = '7b839c68-a211-48f2-a38f-d15e7558a4ea';
const detail: OfficeWorkspaceDetail = {
  id: workspaceId,
  officeId: '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea',
  name: 'Example Company',
  slug: 'example-company',
  role: 'member',
  memberCount: 3,
};
const account: AccountDto = {
  id: 'cfd1f021-46b8-45f2-b6c8-a60e88d648f8',
  email: 'person@example.test',
  displayName: 'Office Person',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const api = new ApiClient(async () => new Response('{}', { status: 500 }));

describe('company office preview selection', () => {
  it('opens only for the loaded, authorized company detail', () => {
    expect(canOpenOfficePreview(detail, workspaceId, false, '')).toBe(true);
    expect(canOpenOfficePreview(null, workspaceId, false, '')).toBe(false);
    expect(canOpenOfficePreview(detail, workspaceId, true, '')).toBe(false);
    expect(canOpenOfficePreview(detail, workspaceId, false, 'Access denied')).toBe(false);
    expect(canOpenOfficePreview(detail, '0572e96c-f236-4bb1-8d8c-08b8bfda8937', false, '')).toBe(
      false,
    );
  });

  it('renders the authenticated company in the supplied office shell', () => {
    const html = renderToStaticMarkup(
      createElement(CompanyOfficePreview, {
        account,
        api,
        detail,
        onBack: () => undefined,
        onOpenSecurity: () => undefined,
      }),
    );
    expect(html).toContain('Example Company');
    expect(html).not.toContain('Company slug:');
    expect(html).not.toContain('SIGN-IN STATUS');
    expect(html).not.toContain('Employee invitations');
    expect(html).toContain('Welcome to Example Company');
    expect(html).toContain('person@example.test');
    expect(html).toContain('Your camera is off');
    expect(html).toContain('Display name');
    expect(html).not.toContain('data-testid="openoffice-vivo-scene"');
    expect(html).not.toContain('Commons office');
    expect(html).toContain('>Join</button>');
    expect(html).not.toContain('office-map');
    expect(html).not.toContain('Text chat is unavailable');
  });
});

describe('office chat view', () => {
  it('renders the supplied view with the live fixed channel and retention copy', () => {
    const html = renderToStaticMarkup(
      createElement(ChatView, {
        conversation: { kind: 'channel', id: 'office' },
        channels: [
          {
            id: 'office',
            name: 'office',
            topic: 'Company-wide office chat · Messages are retained for 90 days.',
          },
        ],
        users: [],
        participants: [],
        selfUserId: account.id,
        messages: [
          {
            id: 'message-1',
            participantId: account.id,
            userId: account.id,
            name: account.displayName,
            text: 'Hello from the office',
            channel: 'channel',
            channelId: 'office',
            createdAt: '2026-11-10T12:00:00.000Z',
          },
        ],
        online: true,
        draft: '',
        onDraft: () => undefined,
        onSend: () => undefined,
        onTopic: () => undefined,
        englishOnly: true,
        topicEditable: false,
        showChannelTools: false,
      }),
    );
    expect(html).toContain('Welcome to #office');
    expect(html).toContain('Messages are retained for 90 days.');
    expect(html).toContain('Hello from the office');
    expect(html).toContain('Message office');
    expect(html).not.toContain('office-preview');
  });

  it('keeps the default chat surface on the saved interface language', () => {
    const previousLanguage = language();
    setLanguage('es');
    try {
      const html = renderToStaticMarkup(
        createElement(ChatView, {
          conversation: { kind: 'nearby' },
          channels: [],
          users: [],
          participants: [],
          selfUserId: 'user-1',
          messages: [],
          online: false,
          draft: '',
          onDraft: () => undefined,
          onSend: () => undefined,
          onTopic: () => undefined,
        }),
      );
      expect(html).toContain('Cerca de ti');
      expect(html).toContain(
        'Los mensajes llegan solo a quienes están en tu zona de conversación. No se guardan.',
      );
    } finally {
      setLanguage(previousLanguage);
    }
  });
});

describe('Commons renderer lifecycle', () => {
  it('destroys the Phaser game and detaches its host exactly once', () => {
    const game = { destroy: vi.fn() };
    const parent = { remove: vi.fn() };
    const cleanup = createCommonsSceneCleanup(game, parent);

    cleanup();
    cleanup();

    expect(game.destroy).toHaveBeenCalledTimes(1);
    expect(game.destroy).toHaveBeenCalledWith(true);
    expect(parent.remove).toHaveBeenCalledTimes(1);
    expect(game.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      parent.remove.mock.invocationCallOrder[0]!,
    );
  });

  it('still detaches the host when Phaser teardown throws', () => {
    const game = {
      destroy: vi.fn(() => {
        throw new Error('renderer unavailable');
      }),
    };
    const parent = { remove: vi.fn() };
    const cleanup = createCommonsSceneCleanup(game, parent);

    expect(() => cleanup()).toThrow('renderer unavailable');
    expect(parent.remove).toHaveBeenCalledTimes(1);
    expect(() => cleanup()).not.toThrow();
  });
});
