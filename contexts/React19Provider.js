import { createContext, useContext, useTransition, Suspense } from 'react';

const React19Context = createContext({
  startTransition: () => {},
  isPending: false
});

export function useReact19() {
  return useContext(React19Context);
}

export function React19Provider({ children }) {
  const [isPending, startTransition] = useTransition({
    timeoutMs: 3000 // 3 second timeout for transitions
  });

  return (
    <React19Context.Provider value={{ startTransition, isPending }}>
      <Suspense fallback={<div>Loading...</div>}>
        {children}
      </Suspense>
    </React19Context.Provider>
  );
} 