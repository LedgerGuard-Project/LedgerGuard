import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useAuthStore } from './store/authStore';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing in index.html');
}
const root = createRoot(container);

// Bootstrap auth session from persisted tokens (hydrate check).
const store = useAuthStore as unknown as { persist: { rehydrate?: () => void } };
if (store.persist?.rehydrate) store.persist.rehydrate();

// PWA: register service worker to enable offline app-shell caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline-capable UI is optional */
    });
  });
}

root.render(<App />);