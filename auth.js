// =============================================================
// Auth Module - Enhanced authentication for Aryal Store
// =============================================================

const AUTH_API = '/api/auth';
const USERS_API = '/api/users';

function getToken() {
  return localStorage.getItem('aryal_token');
}

function getRefreshToken() {
  return localStorage.getItem('aryal_refresh_token');
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('aryal_user')); } catch { return null; }
}

function saveAuth(token, user, refreshToken) {
  localStorage.setItem('aryal_token', token);
  localStorage.setItem('aryal_user', JSON.stringify(user));
  if (refreshToken) localStorage.setItem('aryal_refresh_token', refreshToken);
  if (user && user.email_verified_at) {
    localStorage.setItem('aryal_email_verified', 'true');
  }
}

function clearAuth() {
  localStorage.removeItem('aryal_token');
  localStorage.removeItem('aryal_user');
  localStorage.removeItem('aryal_refresh_token');
  localStorage.removeItem('aryal_email_verified');
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.code === 'TOKEN_EXPIRED') {
        clearAuth();
        updateUserMenu();
        showToast('Session expired. Please login again.', 'warning');
        openAuthModal('login');
        return null;
      }
    }
    return res;
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
    return null;
  }
}

async function authRegister(data) {
  const btn = document.getElementById('authSignupBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...'; }

  try {
    const res = await fetch(AUTH_API + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();

    if (!res.ok) {
      showAuthError(result.error || 'Registration failed');
      return null;
    }

    saveAuth(result.token, result.user);
    closeAuthModal();
    updateUserMenu();
    mergeGuestCart();
    showToast('Account created! Please check your email to verify.', 'success');
    return result;
  } catch (e) {
    showAuthError('Network error. Please try again.');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Create Account'; }
  }
}

async function authLogin(data) {
  const btn = document.getElementById('authLoginBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...'; }

  try {
    data.mergeCart = true;
    data.sessionId = localStorage.getItem('aryal_session_id');

    const res = await fetch(AUTH_API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();

    if (!res.ok) {
      if (res.status === 429) {
        showAuthError(result.error);
      } else {
        showAuthError(result.error || 'Login failed');
      }
      return null;
    }

    saveAuth(result.token, result.user);
    closeAuthModal();
    updateUserMenu();
    mergeGuestCart();
    loadUserCart();
    showToast('Welcome back, ' + (result.user.name || result.user.email) + '!', 'success');
    return result;
  } catch (e) {
    showAuthError('Network error. Please try again.');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Sign In'; }
  }
}

async function authLogout() {
  try {
    await fetch(AUTH_API + '/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }
    });
  } catch {}
  clearAuth();
  updateUserMenu();
  updateCartUI();
  showToast('Logged out successfully', 'info');
  closeProfileSection();
}

async function forgotPassword(email) {
  const btn = document.getElementById('forgotPwdBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

  try {
    const res = await fetch(AUTH_API + '/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to send reset email', 'error');
      return null;
    }

    if (data.reset_token) {
      showResetPasswordForm(data.reset_token);
    } else {
      showToast('If an account exists, a reset link has been sent.', 'success');
      closeAuthModal();
    }
    return data;
  } catch {
    showToast('Network error', 'error');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Send Reset Link'; }
  }
}

async function resetPassword(token, password, confirmPassword) {
  const btn = document.getElementById('resetPwdBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...'; }

  try {
    const res = await fetch(AUTH_API + '/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, confirmPassword })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Reset failed', 'error');
      return null;
    }

    showToast('Password reset successfully. Please login.', 'success');
    showLoginForm();
    return data;
  } catch {
    showToast('Network error', 'error');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Reset Password'; }
  }
}

async function updateProfile(data) {
  const res = await authFetch(USERS_API + '/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!res) return null;
  const result = await res.json();
  if (!res.ok) { showToast(result.error || 'Update failed', 'error'); return null; }
  const user = getCurrentUser();
  saveAuth(getToken(), { ...user, ...result.user });
  updateUserMenu();
  loadProfileSection();
  showToast('Profile updated successfully', 'success');
  return result;
}

async function changePassword(data) {
  const res = await authFetch(USERS_API + '/change-password', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!res) return null;
  const result = await res.json();
  if (!res.ok) { showToast(result.error || 'Failed to change password', 'error'); return null; }
  showToast('Password changed successfully', 'success');
  return result;
}

async function fetchProfile() {
  const res = await authFetch(AUTH_API + '/me');
  if (!res) return null;
  const data = await res.json();
  if (!res.ok) return null;
  const user = getCurrentUser();
  saveAuth(getToken(), { ...user, ...data });
  return data;
}

async function fetchAddresses() {
  const res = await authFetch(USERS_API + '/addresses');
  if (!res) return [];
  return res.json();
}

async function saveAddress(data) {
  const res = await authFetch(USERS_API + '/addresses', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!res) return null;
  const result = await res.json();
  if (!res.ok) { showToast(result.error || 'Failed to save address', 'error'); return null; }
  showToast('Address saved', 'success');
  return result;
}

async function deleteAddress(id) {
  const res = await authFetch(USERS_API + '/addresses/' + id, { method: 'DELETE' });
  if (!res) return false;
  if (!res.ok) { showToast('Failed to delete address', 'error'); return false; }
  showToast('Address deleted', 'info');
  return true;
}

async function fetchOrders() {
  const res = await authFetch(USERS_API + '/orders');
  if (!res) return [];
  return res.json();
}

async function resendVerification() {
  const res = await authFetch(AUTH_API + '/resend-verification', { method: 'POST' });
  if (!res) return;
  const data = await res.json();
  showToast(data.message || 'Verification email sent', 'success');
}

// ==================== CART MERGE ====================
async function mergeGuestCart() {
  const sessionId = localStorage.getItem('aryal_session_id');
  if (!sessionId) return;
  try {
    await authFetch(USERS_API + '/cart/merge', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  } catch {}
}

async function loadUserCart() {
  const user = getCurrentUser();
  if (!user) return;
  // Cart is loaded via existing cart mechanism
  loadCart();
}

// ==================== UI Functions ====================
function showAuthError(message) {
  const el = document.getElementById('authError');
  if (el) { el.textContent = message; el.style.display = 'block'; }
  showToast(message, 'error');
}

function validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 8) errors.push('Minimum 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Uppercase letter required');
  if (!/[a-z]/.test(password)) errors.push('Lowercase letter required');
  if (!/[0-9]/.test(password)) errors.push('Number required');
  return errors;
}

function showPasswordStrength(password) {
  const el = document.getElementById('passwordStrength');
  if (!el) return;
  const errors = validatePasswordStrength(password);
  if (!password) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (errors.length === 0) {
    el.innerHTML = '<span style="color:#27ae60;"><i class="fas fa-check-circle"></i> Strong password</span>';
  } else {
    el.innerHTML = '<span style="color:#e74c3c;font-size:0.78rem;">' + errors.join(' | ') + '</span>';
  }
}

function showForgotPasswordForm() {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('authFormLogin').style.display = 'none';
  document.getElementById('authFormSignup').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

function showResetPasswordForm(token) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('authFormLogin').style.display = 'none';
  document.getElementById('authFormSignup').style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  const resetForm = document.getElementById('authResetForm');
  if (resetForm) {
    resetForm.style.display = 'block';
    document.getElementById('resetTokenInput').value = token;
  }
}

function showLoginForm() {
  const resetForm = document.getElementById('authResetForm');
  if (resetForm) resetForm.style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  switchAuthTab('login');
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type) {
  if (typeof toast === 'function') {
    toast(message, type);
    return;
  }
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const colors = { success: '#27ae60', error: '#e74c3c', info: '#3498db', warning: '#f39c12' };
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
  toast.style.cssText = 'background:' + (colors[type] || colors.info) + ';color:#fff;padding:12px 20px;border-radius:8px;margin-bottom:8px;font-size:0.9rem;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;min-width:280px;';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}
