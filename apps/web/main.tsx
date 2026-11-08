import { createRoot } from 'react-dom/client';
import AuthApp from './src/features/auth/AuthApp';
import './styles.css';
const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && params.get('commons-preview') === '1') {
  void import('./commons-preview/CommonsPreview')
    .then(({ CommonsPreview }) => root.render(<CommonsPreview />))
    .catch(() => root.render(<p role="alert">Could not load the Commons preview.</p>));
} else root.render(<AuthApp />);
