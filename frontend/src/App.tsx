import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import { NotificationCenter } from './components/NotificationCenter';
import { ThemeProvider } from './components/ThemeProvider';
import { useRealtime } from './hooks/useRealtime';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* useRealtime must run INSIDE QueryClientProvider so useQueryClient()
            resolves the app-level client. Keeping exactly one QueryClient here. */}
        <RealtimeBridge />
        <RouterProvider router={router} />
        <NotificationCenter />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Subscribes to Socket.IO events and invalidates React Query caches. */
function RealtimeBridge(): null {
  useRealtime();
  return null;
}

export default App;