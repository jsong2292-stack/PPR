'use client';

import * as React from 'react';

type ToastVariant = 'default' | 'destructive';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((newToast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...newToast, id }]);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Return a no-op implementation if not in provider
    return {
      toasts: [],
      toast: (toast: Omit<Toast, 'id'>) => {
        console.log('Toast:', toast.title, toast.description);
      },
      dismiss: () => {},
    };
  }
  return context;
}

// Export toast function directly for convenience
export const toast = (props: Omit<Toast, 'id'>) => {
  // This is a simple implementation that logs to console
  // In a real app, this would use a global toast context
  console.log('Toast:', props.title, props.description);
  
  // Create a simple alert for now
  if (typeof window !== 'undefined') {
    // Use browser notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(props.title || '通知', { body: props.description });
    }
  }
};
