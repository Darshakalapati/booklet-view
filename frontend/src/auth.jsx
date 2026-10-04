import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    api('/auth/me/')
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener('booklet:signed-out', onSignedOut);
    return () => window.removeEventListener('booklet:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (username, password) => {
    const result = await api('/auth/login/', { method: 'POST', body: { username, password } });
    setToken(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout/', { method: 'POST' });
    } catch {
      /* the token is dropped below either way */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, checking, signIn, signOut, isAdmin: user?.role === 'admin' }),
    [user, checking, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
