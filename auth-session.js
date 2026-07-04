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

  function isTokenExpired(token) {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp * 1000 < Date.now();
    } catch { return true; }
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
      } else {
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
