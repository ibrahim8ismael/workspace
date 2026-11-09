import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createCommonsSceneCleanup } from '../commons-preview/scene-lifecycle';
import type { OfficeWorkspaceDetail } from '../src/lib/api';
import {
  canOpenOfficePreview,
  companyOverviewViewReducer,
} from '../src/features/workspaces/company-overview-view';
import { OfficePreviewChat } from '../src/features/workspaces/OfficePreviewChat';
import { CompanyOfficePreview } from '../src/features/workspaces/CompanyOfficePreview';
import { ApiClient } from '../src/lib/api';
import ChatView from '../chat/ChatView';
import { language, setLanguage } from '../i18n';

vi.mock('../commons-preview/CommonsScene', () => ({
  CommonsScene: () => null,
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

  it('opens and returns to company details, resetting on company teardown', () => {
    const preview = companyOverviewViewReducer('details', 'open-preview');
    expect(preview).toBe('preview');
    expect(companyOverviewViewReducer(preview, 'open-preview')).toBe('preview');
    expect(companyOverviewViewReducer(preview, 'back-to-details')).toBe('details');
    expect(companyOverviewViewReducer(preview, 'reset')).toBe('details');
  });

  it('renders the authenticated company identity and explicit local-preview boundary', () => {
    const html = renderToStaticMarkup(
      createElement(CompanyOfficePreview, { api, detail, onBack: () => undefined }),
    );
    expect(html).toContain('Example Company');
    expect(html).toContain('gather/example-company');
    expect(html).toContain('Company-scoped office');
    expect(html).toContain('Back to company details');
    expect(html).toContain('Not connected to the office.');
    expect(html).toContain('Enter office');
    expect(html).toContain('Text chat is unavailable');
  });
});

describe('disconnected preview chat', () => {
  it('shows an empty, disconnected, non-sendable chat surface', () => {
    const html = renderToStaticMarkup(
      createElement(OfficePreviewChat, { companyName: 'Example Company' }),
    );
    expect(html).toContain('Text chat is unavailable');
    expect(html).toContain('No participants or messages are loaded for Example Company.');
    expect(html).toContain('Sending is disabled');
    expect(html).toContain('Text chat unavailable');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*class="chat-send"[^>]*disabled/);
    expect(html).not.toContain('class="chat-message');
  });

  it('keeps the preview in English when the saved interface language is Spanish', () => {
    const previousLanguage = language();
    setLanguage('es');
    try {
      const html = renderToStaticMarkup(
        createElement(OfficePreviewChat, { companyName: 'Example Company' }),
      );
      expect(html).toContain('Welcome to #office-preview');
      expect(html).toContain('Message office-preview');
      expect(html).toContain('More options');
      expect(html).not.toContain('Cerca de ti');
    } finally {
      setLanguage(previousLanguage);
    }
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
