import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateWorkspaceLayoutPreset } from '@gather/world';
import { WorkspaceMapLayer } from '../commons-preview/WorkspaceMapLayer';

describe('workspace map signage', () => {
  it('renders only wayfinding text while preserving accessible room names', () => {
    const preset = 'studio-orthogonal';
    const placements = generateWorkspaceLayoutPreset(preset, 8).map((placement) =>
      placement.id === 'private-office-4' ? { ...placement, name: 'Design Office' } : placement,
    );
    const markup = renderToStaticMarkup(createElement(WorkspaceMapLayer, { preset, placements }));
    const signs = Array.from(markup.matchAll(/<text[^>]*>([^<]+)<\/text>/g), (match) => match[1]);

    expect(signs).toEqual(['Open area', 'Reception']);
    expect(markup).toContain('<title>Design Office</title>');
  });
});
