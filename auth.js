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
  localStorage.removeItem('aryal_remember');
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
    if (!res.ok) { showAuthError(result.error || 'Registration failed'); return null; }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 429) showAuthError(result.error);
      else showAuthError(result.error || 'Login failed');
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
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to send reset email', 'error'); return null; }
    if (data.reset_token) showResetPasswordForm(data.reset_token);
    else { showToast('If an account exists, a reset link has been sent.', 'success'); closeAuthModal(); }
    return data;
  } catch { showToast('Network error', 'error'); return null; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Send Reset Link'; } }
}

async function resetPassword(token, password, confirmPassword) {
  const btn = document.getElementById('resetPwdBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...'; }
  try {
    const res = await fetch(AUTH_API + '/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, confirmPassword })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Reset failed', 'error'); return null; }
    showToast('Password reset successfully. Please login.', 'success');
    showLoginForm();
    return data;
  } catch { showToast('Network error', 'error'); return null; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Reset Password'; } }
}

async function updateProfile(data) {
  const res = await authFetch(USERS_API + '/profile', {
    method: 'PUT', body: JSON.stringify(data)
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
    method: 'PUT', body: JSON.stringify(data)
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
    method: 'POST', body: JSON.stringify(data)
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

// ==================== OTP ====================
async function sendOtp(phone) {
  try {
    const res = await fetch(AUTH_API + '/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to send OTP', 'error'); return null; }
    return data;
  } catch { showToast('Network error', 'error'); return null; }
}

async function verifyOtp(phone, otp) {
  try {
    const res = await fetch(AUTH_API + '/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Invalid OTP', 'error'); return null; }
    saveAuth(data.token, data.user);
    updateUserMenu();
    mergeGuestCart();
    showToast('Phone verified successfully!', 'success');
    return data;
  } catch { showToast('Network error', 'error'); return null; }
}

async function sendGoogleEmailOtp(credential) {
  try {
    const res = await fetch(USERS_API + '/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to send code', 'error'); return null; }
    return data;
  } catch { showToast('Network error', 'error'); return null; }
}

async function verifyGoogleEmailOtp(credential, otp) {
  try {
    const res = await fetch(AUTH_API + '/verify-google-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, otp })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Invalid code', 'error'); return null; }
    saveAuth(data.token, data.user);
    updateUserMenu();
    mergeGuestCart();
    return data;
  } catch { showToast('Network error', 'error'); return null; }
}

// ==================== CART MERGE ====================
async function mergeGuestCart() {
  const sessionId = localStorage.getItem('aryal_session_id');
  if (!sessionId) return;
  try { await authFetch(USERS_API + '/cart/merge', { method: 'POST', body: JSON.stringify({ sessionId }) }); } catch {}
}

async function loadUserCart() {
  const user = getCurrentUser();
  if (!user) return;
  if (typeof loadCart === 'function') loadCart();
}

// ==================== UI ====================
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
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Special character required');
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
  if (resetForm) { resetForm.style.display = 'block'; document.getElementById('resetTokenInput').value = token; }
}

function showLoginForm() {
  const resetForm = document.getElementById('authResetForm');
  if (resetForm) resetForm.style.display = 'none';
  document.getElementById('authForgotForm').style.display = 'none';
  if (typeof switchAuthTab === 'function') switchAuthTab('login');
}

function showOtpModal(phone) {
  const existing = document.getElementById('otpModalOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'otpModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:32px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.15);">
      <div style="text-align:center;margin-bottom:20px;">
        <h3 style="margin-bottom:6px;font-size:1.2rem;">Verify Phone</h3>
        <p style="color:#888;font-size:0.88rem;">Enter the code sent to ${phone}</p>
      </div>
      <div id="otpInputs" style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
        ${[1,2,3,4,5,6].map(i => `<input type="text" maxlength="1" class="otp-digit" data-idx="${i-1}" style="width:44px;height:52px;text-align:center;font-size:1.25rem;font-weight:700;border:1.5px solid #ddd;border-radius:8px;outline:none;font-family:inherit;">`).join('')}
      </div>
      <div id="otpTimerDisplay" style="text-align:center;font-size:0.85rem;color:#888;margin-bottom:16px;">Code expires in <span id="otpCountdown" style="color:#e94560;font-weight:700;">05:00</span></div>
      <div style="text-align:center;margin-bottom:16px;"><button id="resendOtpModal" disabled style="background:none;border:none;color:#e94560;font-weight:600;cursor:pointer;font-family:inherit;">Resend Code</button></div>
      <button id="verifyOtpBtn" style="width:100%;padding:14px;border:none;border-radius:8px;background:#e94560;color:#fff;font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit;">Verify</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const inputs = overlay.querySelectorAll('.otp-digit');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
      if (this.value && idx < 5) inputs[idx+1].focus();
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) inputs[idx-1].focus();
    });
    inp.addEventListener('paste', function(e) {
      e.preventDefault();
      const paste = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      paste.split('').forEach((c,i) => { if(inputs[i]) inputs[i].value=c; });
      inputs[Math.min(paste.length,5)].focus();
    });
  });
  inputs[0].focus();
  let expiresAt = Date.now() + 300000;
  const timer = setInterval(() => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now())/1000));
    document.getElementById('otpCountdown').textContent = String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
    if (remaining <= 0) { clearInterval(timer); document.getElementById('resendOtpModal').disabled = false; }
  }, 1000);
  document.getElementById('resendOtpModal').addEventListener('click', function() {
    sendOtp(phone); expiresAt = Date.now() + 300000; this.disabled = true;
    inputs.forEach(i => i.value = '');
    inputs[0].focus();
  });
  document.getElementById('verifyOtpBtn').addEventListener('click', async function() {
    const otp = Array.from(inputs).map(i => i.value).join('');
    if (otp.length !== 6) { showToast('Enter all 6 digits', 'error'); return; }
    this.disabled = true; this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    const result = await verifyOtp(phone, otp);
    this.disabled = false; this.textContent = 'Verify';
    if (result) { overlay.remove(); clearInterval(timer); closeAuthModal(); }
  });
}

function showEmailOtpModal(credential, email) {
  const existing = document.getElementById('otpModalOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'otpModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:32px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.15);">
      <div style="text-align:center;margin-bottom:20px;">
        <h3 style="margin-bottom:6px;font-size:1.2rem;">Verify Email</h3>
        <p style="color:#888;font-size:0.88rem;word-break:break-all;">Enter the code sent to ${email}</p>
      </div>
      <div id="otpInputs" style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
        ${[1,2,3,4,5,6].map(i => `<input type="text" maxlength="1" class="otp-digit" data-idx="${i-1}" style="width:44px;height:52px;text-align:center;font-size:1.25rem;font-weight:700;border:1.5px solid #ddd;border-radius:8px;outline:none;font-family:inherit;">`).join('')}
      </div>
      <div id="otpTimerDisplay" style="text-align:center;font-size:0.85rem;color:#888;margin-bottom:16px;">Code expires in <span id="otpCountdown" style="color:#e94560;font-weight:700;">05:00</span></div>
      <div style="text-align:center;margin-bottom:16px;"><button id="resendOtpModal" disabled style="background:none;border:none;color:#e94560;font-weight:600;cursor:pointer;font-family:inherit;">Resend Code</button></div>
      <button id="verifyOtpBtn" style="width:100%;padding:14px;border:none;border-radius:8px;background:#e94560;color:#fff;font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit;">Verify</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const inputs = overlay.querySelectorAll('.otp-digit');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
      if (this.value && idx < 5) inputs[idx+1].focus();
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) inputs[idx-1].focus();
    });
    inp.addEventListener('paste', function(e) {
      e.preventDefault();
      const paste = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      paste.split('').forEach((c,i) => { if(inputs[i]) inputs[i].value=c; });
      inputs[Math.min(paste.length,5)].focus();
    });
  });
  inputs[0].focus();
  let expiresAt = Date.now() + 300000;
  const timer = setInterval(() => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now())/1000));
    document.getElementById('otpCountdown').textContent = String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
    if (remaining <= 0) { clearInterval(timer); document.getElementById('resendOtpModal').disabled = false; }
  }, 1000);
  document.getElementById('resendOtpModal').addEventListener('click', function() {
    sendGoogleEmailOtp(credential); expiresAt = Date.now() + 300000; this.disabled = true;
    inputs.forEach(i => i.value = '');
    inputs[0].focus();
  });
  document.getElementById('verifyOtpBtn').addEventListener('click', async function() {
    const otp = Array.from(inputs).map(i => i.value).join('');
    if (otp.length !== 6) { showToast('Enter all 6 digits', 'error'); return; }
    this.disabled = true; this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    const result = await verifyGoogleEmailOtp(credential, otp);
    this.disabled = false; this.textContent = 'Verify';
    if (result) {
      overlay.remove(); clearInterval(timer);
      if (typeof closeAuthModal === 'function') closeAuthModal();
      if (typeof redirectAfterLogin === 'function') redirectAfterLogin();
      else window.location.href = '/';
    }
  });
}

// ==================== TOAST ====================
function showToast(message, type) {
  if (typeof toast === 'function') { toast(message, type); return; }
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const colors = { success: '#27ae60', error: '#e74c3c', info: '#3498db', warning: '#f39c12' };
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
  el.style.cssText = 'background:' + (colors[type] || colors.info) + ';color:#fff;padding:12px 20px;border-radius:8px;margin-bottom:8px;font-size:0.9rem;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;min-width:280px;';
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 4000);
}
