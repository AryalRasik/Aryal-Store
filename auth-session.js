(function() {
  'use strict';

  const CHECK_INTERVAL = 60000;
  const API_ME = '/api/auth/me';

  function getToken() {
    return localStorage.getItem('aryal_token');
  }

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('aryal_user')); } catch { return null; }
  }

  function clearAuth() {
    localStorage.removeItem('aryal_token');
    localStorage.removeItem('aryal_user');
    localStorage.removeItem('aryal_refresh_token');
    localStorage.removeItem('aryal_email_verified');
    localStorage.removeItem('aryal_remember');
  }

  function saveAuth(token, user) {
    localStorage.setItem('aryal_token', token);
    localStorage.setItem('aryal_user', JSON.stringify(user));
    if (user && user.email_verified_at) {
      localStorage.setItem('aryal_email_verified', 'true');
    }
  }

  function decodeJwtPayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const json = decodeURIComponent(Array.prototype.map.call(atob(base64), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch { return null; }
  }

  function isTokenExpired(token) {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 < Date.now();
  }

  async function validateSession() {
    const token = getToken();
    if (!token) {
      if (typeof updateUserMenu === 'function') updateUserMenu();
      return;
    }

    if (isTokenExpired(token)) {
      clearAuth();
      if (typeof updateUserMenu === 'function') updateUserMenu();
      return;
    }

    try {
      const res = await fetch(API_ME, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.ok) {
        const data = await res.json();
        const user = getCurrentUser();
        if (user) saveAuth(token, { ...user, ...data });
      } else if (res.status === 401) {
        clearAuth();
        if (typeof updateUserMenu === 'function') updateUserMenu();
      }
    } catch {
      if (typeof updateUserMenu === 'function') updateUserMenu();
    }
  }

  validateSession();
  setInterval(validateSession, CHECK_INTERVAL);

  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) validateSession();
  });

})();
