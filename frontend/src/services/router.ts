import { useEffect, useState } from 'react';

/** Minimal path router for the few public pages; the dashboard itself lives at "/". */
const NAV_EVENT = 'k8spulse:navigate';

export function navigate(path: string, { replace = false } = {}): void {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return path;
}

export const AUTH_PATHS = {
  userLogin: '/login',
  userRegister: '/register',
  adminLogin: '/admin/login',
  adminRegister: '/admin/register',
} as const;

/** Where to send someone who is signed out: the sign-in page they used last. */
export function signInPathForLastPortal(): string {
  try {
    return localStorage.getItem('k8spulse.portal') === 'admin' ? AUTH_PATHS.adminLogin : AUTH_PATHS.userLogin;
  } catch {
    return AUTH_PATHS.userLogin;
  }
}
