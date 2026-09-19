import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

export interface AuthUser {
  id: string;
  role: 'super_admin' | 'state_admin' | 'worker';
  fullName: string;
  email: string;
  stateId?: string;
  is2faEnabled: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (identifier: string, password: string, totpCode?: string) => Promise<{ requires2fa?: boolean }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('nexora_token');
    const storedUser = localStorage.getItem('nexora_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (identifier: string, password: string, totpCode?: string) => {
    const res = await api.post('/auth/login', { identifier, password, totpCode });
    const { token: newToken, user: newUser } = res.data.data;

    if (newUser.requires2fa) {
      return { requires2fa: true };
    }

    localStorage.setItem('nexora_token', newToken);
    localStorage.setItem('nexora_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return {};
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => null);
    localStorage.removeItem('nexora_token');
    localStorage.removeItem('nexora_user');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
