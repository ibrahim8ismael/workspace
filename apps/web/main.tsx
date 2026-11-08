import { createRoot } from 'react-dom/client';
import WorkspaceHome from './WorkspaceHome';
import './styles.css';
// Without a workspace in the address, show the workspace list. With one, learn its map first: the office modules
// read the map when they load, so the app is imported only after it is chosen.
const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root')!);
const slug = params.get('room');
if (import.meta.env.DEV && params.get('commons-preview') === '1') {
  void import('./commons-preview/CommonsPreview')
    .then(({ CommonsPreview }) => root.render(<CommonsPreview />))
    .catch(() => root.render(<p role="alert">Could not load the Commons preview.</p>));
} else if (!slug || params.has('new')) root.render(<WorkspaceHome />);
else
  void (async () => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(slug)}`);
      if (response.ok)
        (globalThis as { __OFFICE_MAP__?: string }).__OFFICE_MAP__ = (await response.json()).map;
    } catch {
      /* default map */
    }
    const { default: App } = await import('./App');
    root.render(<App />);
  })();
