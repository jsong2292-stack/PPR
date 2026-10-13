'use client';

/**
 * 前端认证上下文
 *
 * 在 app/layout.tsx 中包裹全站，提供：
 *   const { user, loading, login, logout, refresh } = useAuth();
 */
import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  useRef,
  useCallback,
} from 'react';

export interface AuthUser {
  id: string;
  username?: string | null;
  phone?: string | null;
  email?: string | null;
  nickname: string;
  avatar: string | null;
  role: string;
  bio?: string | null;
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await res.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    refresh();
  }, [refresh]);

  const login = async (username: string, password: string, remember = false) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    setUser(data.user);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

/** 未包裹 Provider 时返回安全默认值，避免组件崩溃 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      loading: false,
      login: async () => {},
      logout: async () => {},
      refresh: async () => {},
    };
  }
  return context;
}
