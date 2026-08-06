(function() {
  'use strict';

  const AUTH_API = '/api/auth';
  const API_ORDERS = '/api/orders';
  const API_CART = '/api/cart';
  const API_COUPON = '/api/coupons/validate';
  const API_ADDR = '/api/users/addresses';
  const API_ME = '/api/auth/me';

  let state = {
    step: 1,
    cart: [],
    user: null,
    token: null,
    shipping: { method: 'standard', cost: 0, label: 'Standard Delivery' },
    payment: 'cod',
    coupon: null,
    discount: 0,
    address: null,
    addresses: [],
    orderId: null,
    loading: false
  };

  const steps = [
    { id: 1, label: 'Cart' },
    { id: 2, label: 'Login' },
    { id: 3, label: 'Address' },
    { id: 4, label: 'Delivery' },
    { id: 5, label: 'Payment' },
    { id: 6, label: 'Review' }
  ];

  const shippingMethods = [
    { id: 'standard', label: 'Standard Delivery', eta: '5-7 business days', cost: 0 },
    { id: 'express', label: 'Express Delivery', eta: '2-3 business days', cost: 200 },
    { id: 'same_day', label: 'Same Day Delivery', eta: 'Today (order before 2PM)', cost: 500 }
  ];

  const paymentMethods = [
    { id: 'cod', label: 'Cash on Delivery', icon: 'fa-money-bill-wave', desc: 'Pay when you receive' },
    { id: 'esewa', label: 'eSewa', icon: 'fa-mobile-alt', desc: 'Pay via eSewa wallet' },
    { id: 'khalti', label: 'Khalti', icon: 'fa-mobile-alt', desc: 'Pay via Khalti wallet' },
    { id: 'fonepay', label: 'Fonepay', icon: 'fa-university', desc: 'Pay via Fonepay' },
    { id: 'card', label: 'Credit/Debit Card', icon: 'fa-credit-card', desc: 'Visa, Mastercard, etc.' }
  ];

  const LOCATIONS = window.NEPAL_LOCATIONS || { provinces: [] };

  function getProvince(name) { return LOCATIONS.provinces.find(p => p.name === name); }
  function getDistrictData(province, name) { const p = getProvince(province); return p ? p.districts.find(d => d.name === name) : null; }

  function populateAddressSelects() {
    const provSel = $('addrProvince');
    if (!provSel) return;
    provSel.innerHTML = '<option value="">Select Province</option>' + LOCATIONS.provinces.map(p =>
      `<option value="${p.name}">${p.name}${p.nameNp ? ' (' + p.nameNp + ')' : ''}</option>`).join('');
    populateDistricts();
  }

  function populateDistricts() {
    const provSel = $('addrProvince');
    const distSel = $('addrDistrict');
    if (!distSel) return;
    const province = provSel.value;
    const districts = province ? (getProvince(province) || {}).districts || [] : [];
    distSel.innerHTML = '<option value="">Select District</option>' + districts.map(d =>
      `<option value="${d.name}">${d.name}${d.nameNp ? ' (' + d.nameNp + ')' : ''}</option>`).join('');
    distSel.disabled = !province;
    populateMunicipalities();
  }

  function populateMunicipalities() {
    const distSel = $('addrDistrict');
    const munSel = $('addrMunicipality');
    if (!munSel) return;
    const district = distSel.value;
    const muns = district ? (getDistrictData($('addrProvince').value, district) || {}).municipalities || [] : [];
    munSel.innerHTML = '<option value="">Select Municipality</option>' + muns.map(m =>
      `<option value="${m.name}">${m.name}${m.nameNp ? ' (' + m.nameNp + ')' : ''}</option>`).join('');
    munSel.disabled = !district;
  }

  function formatAddress(a) {
    if (!a) return '';
    const parts = [
      a.municipality || '',
      a.district || a.city || '',
      a.ward ? 'Ward ' + a.ward : '',
      a.tole || a.address || ''
    ].filter(Boolean);
    const line = parts.join(', ');
    const prov = a.state || a.province || '';
    return line + (prov ? ', ' + prov : '');
  }

  function $(id) { return document.getElementById(id); }

  // ==================== INIT ====================
  function init() {
    createToastContainer();
    createAuthModal();
    populateAddressSelects();
    renderSteps();
    loadCart();
    checkAuth();
    bindEvents();
  }

  // ==================== TOAST ====================
  function createToastContainer() {
    if (!$('coToastContainer')) {
      const el = document.createElement('div');
      el.id = 'coToastContainer';
      el.className = 'co-toast-container';
      document.body.appendChild(el);
    }
  }

  function showToast(msg, type) {
    const container = $('coToastContainer');
    const t = document.createElement('div');
    t.className = 'co-toast ' + type;
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 4000);
  }

  // ==================== AUTH ====================
  function getToken() { return state.token || localStorage.getItem('aryal_token'); }
  function getCurrentUser() { return state.user || (function(){ try { return JSON.parse(localStorage.getItem('aryal_user')); } catch { return null; } })(); }

  function saveAuth(token, user) {
    state.token = token; state.user = user;
    localStorage.setItem('aryal_token', token);
    localStorage.setItem('aryal_user', JSON.stringify(user));
  }

  function clearAuth() {
    state.token = null; state.user = null;
    localStorage.removeItem('aryal_token'); localStorage.removeItem('aryal_user');
  }

  async function checkAuth() {
    const token = getToken();
    if (!token) { updateAuthUI(); return; }
    try {
      const res = await fetch(API_ME, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { const d = await res.json(); state.user = d; state.token = token; await loadAddresses(); }
      else { clearAuth(); }
    } catch { clearAuth(); }
    updateAuthUI();
  }

  async function authLogin(email, password) {
    try {
      const res = await fetch(AUTH_API + '/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mergeCart: true })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Login failed');
      saveAuth(d.token, d.user);
      await loadCart();
      await loadAddresses();
      updateAuthUI();
      closeAuthModal();
      showToast('Welcome back, ' + (d.user.name || d.user.email) + '!', 'success');
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
  }

  async function authRegister(data) {
    try {
      const res = await fetch(AUTH_API + '/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Registration failed');
      saveAuth(d.token, d.user);
      await loadCart();
      await loadAddresses();
      updateAuthUI();
      closeAuthModal();
      showToast('Account created! Welcome to Aryal Store.', 'success');
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
  }

  function updateAuthUI() {
    const user = getCurrentUser();
    const loginStep = document.querySelector('.co-step[data-step="2"]');
    if (loginStep) {
      if (user) {
        loginStep.classList.remove('active'); loginStep.classList.add('done');
        loginStep.querySelector('.co-step-circle').innerHTML = '<i class="fas fa-check"></i>';
      } else {
        loginStep.classList.remove('done');
        loginStep.querySelector('.co-step-circle').textContent = '2';
      }
    }
    const step2 = $('step2');
    if (step2) step2.style.display = user ? 'none' : '';
    if (user && state.step === 2) goToStep(3);
  }

  // ==================== AUTH MODAL ====================
  function createAuthModal() {
    if ($('coAuthModal')) return;
    const div = document.createElement('div');
    div.id = 'coAuthModal';
    div.className = 'co-auth-overlay';
    div.innerHTML = `
      <div class="co-auth-modal">
        <button class="co-auth-close" onclick="document.getElementById('coAuthModal').classList.remove('open')"><i class="fas fa-times"></i></button>
        <div id="coAuthLoginForm">
          <h3 style="margin-bottom:16px;font-size:1.2rem;">Sign In</h3>
          <p style="margin-bottom:20px;font-size:0.88rem;color:var(--co-text-secondary);">Sign in to continue with your checkout.</p>
          <div class="co-field"><input type="text" id="coAuthEmail" placeholder="Email or Phone" style="padding:12px 14px;"></div>
          <div class="co-field"><input type="password" id="coAuthPassword" placeholder="Password" style="padding:12px 14px;"></div>
          <button class="co-btn co-btn-primary co-btn-full co-btn-lg" id="coAuthLoginBtn">Sign In</button>
          <div style="text-align:center;margin:12px 0;"><a href="#" id="coShowSignup" style="color:var(--co-primary);font-size:0.88rem;">Create an account</a></div>
        </div>
        <div id="coAuthSignupForm" style="display:none;">
          <h3 style="margin-bottom:16px;font-size:1.2rem;">Create Account</h3>
          <p style="margin-bottom:20px;font-size:0.88rem;color:var(--co-text-secondary);">Join Aryal Store for faster checkout.</p>
          <div class="co-row"><div class="co-field"><input type="text" id="coAuthFirstName" placeholder="First Name" style="padding:12px 14px;"></div><div class="co-field"><input type="text" id="coAuthLastName" placeholder="Last Name" style="padding:12px 14px;"></div></div>
          <div class="co-field"><input type="email" id="coAuthRegEmail" placeholder="Email" style="padding:12px 14px;"></div>
          <div class="co-field"><input type="tel" id="coAuthPhone" placeholder="Phone Number" style="padding:12px 14px;"></div>
          <div class="co-field"><input type="password" id="coAuthRegPassword" placeholder="Password (min 8 chars)" style="padding:12px 14px;"></div>
          <button class="co-btn co-btn-primary co-btn-full co-btn-lg" id="coAuthSignupBtn">Create Account</button>
          <div style="text-align:center;margin:12px 0;"><a href="#" id="coShowLogin" style="color:var(--co-primary);font-size:0.88rem;">Already have an account? Sign In</a></div>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  function openAuthModal() {
    const m = $('coAuthModal');
    if (m) m.classList.add('open');
  }
  function closeAuthModal() {
    const m = $('coAuthModal');
    if (m) m.classList.remove('open');
  }

  // ==================== CART ====================
  async function loadCart() {
    const user = getCurrentUser();
    const token = getToken();
    let items = [];
    try {
      const raw = localStorage.getItem('aryal_cart');
      if (raw) items = JSON.parse(raw);
      state.cart = items;
    } catch { state.cart = []; }
    renderCart();
    updateSummary();
  }

  function addToCartFromCheckout(item) {
    const existing = state.cart.findIndex(c => c.cartKey === item.cartKey);
    if (existing >= 0) state.cart[existing].qty += item.qty || 1;
    else state.cart.push(item);
    saveCartState();
  }

  function saveCartState() {
    localStorage.setItem('aryal_cart', JSON.stringify(state.cart));
    renderCart();
    updateSummary();
  }

  function removeCartItem(key) {
    state.cart = state.cart.filter(c => c.cartKey !== key);
    saveCartState();
  }

  function updateCartQty(key, delta) {
    const item = state.cart.find(c => c.cartKey === key);
    if (!item) return;
    item.qty = Math.max(1, (item.qty || 1) + delta);
    saveCartState();
  }

  function getSubtotal() {
    return state.cart.reduce((sum, c) => sum + (parseFloat(c.price) || 0) * (c.qty || 1), 0);
  }

  function getShippingCost() { return state.shipping.cost; }
  function getDiscount() { return state.discount; }
  function getTotal() { return Math.max(0, getSubtotal() + getShippingCost() - getDiscount()); }

  // ==================== STEPS ====================
  function renderSteps() {
    const container = $('coSteps');
    if (!container) return;
    let html = '<div class="co-steps-row">';
    steps.forEach((s, i) => {
      html += `<div class="co-step ${s.id === state.step ? 'active' : ''}" data-step="${s.id}">
        <div class="co-step-circle">${s.id}</div>
        <div class="co-step-label">${s.label}</div>
      </div>`;
      if (i < steps.length - 1) html += `<div class="co-step-line"></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function goToStep(n) {
    if (n < 1) n = 1;
    if (n > steps.length) n = steps.length;
    state.step = n;
    document.querySelectorAll('.co-step-content').forEach(el => el.classList.remove('active'));
    const target = $('step' + n);
    if (target) target.classList.add('active');
    document.querySelectorAll('.co-step').forEach(el => {
      el.classList.remove('active');
      const id = parseInt(el.dataset.step);
      if (id === n) el.classList.add('active');
      else if (id < n) { el.classList.add('done'); el.querySelector('.co-step-circle').innerHTML = '<i class="fas fa-check"></i>'; }
      else { el.classList.remove('done'); el.querySelector('.co-step-circle').textContent = id; }
    });
    if (n === 6) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==================== RENDER CART ====================
  function renderCart() {
    const container = $('coCartItems');
    if (!container) return;
    if (!state.cart.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--co-text-muted);"><i class="fas fa-shopping-bag" style="font-size:2.5rem;margin-bottom:12px;display:block;"></i>Your cart is empty</div>';
      $('coCartActions').classList.add('co-hidden');
      return;
    }
    $('coCartActions').classList.remove('co-hidden');
    let html = '';
    state.cart.forEach(item => {
      const img = item.icon || item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
      const variant = [item.size, item.color].filter(Boolean).join(', ');
      html += `<div class="co-cart-item">
        <div class="co-cart-item-img"><img src="${img}" alt="${item.name}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'"></div>
        <div class="co-cart-item-info">
          <div class="co-cart-item-name">${item.name}</div>
          ${variant ? '<div class="co-cart-item-variant">' + variant + '</div>' : ''}
          <div class="co-cart-item-price">Rs. ${parseFloat(item.price).toLocaleString()}</div>
          <div class="co-cart-item-qty">
            <button onclick="window._coUpdateQty('${item.cartKey}', -1)"><i class="fas fa-minus"></i></button>
            <span>${item.qty || 1}</span>
            <button onclick="window._coUpdateQty('${item.cartKey}', 1)"><i class="fas fa-plus"></i></button>
            <button class="co-cart-item-remove" onclick="window._coRemoveItem('${item.cartKey}')"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
        <div class="co-cart-item-total">Rs. ${((parseFloat(item.price) || 0) * (item.qty || 1)).toLocaleString()}</div>
      </div>`;
    });
    container.innerHTML = html;
  }

  window._coUpdateQty = updateCartQty;
  window._coRemoveItem = removeCartItem;

  // ==================== ADDRESSES ====================
  async function loadAddresses() {
    const user = getCurrentUser();
    if (!user) return;
    try {
      const token = getToken();
      const res = await fetch(API_ADDR, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) state.addresses = await res.json();
      else state.addresses = [];
    } catch { state.addresses = []; }
    if (state.addresses.length && !state.address) {
      state.address = state.addresses.find(a => a.is_default) || state.addresses[0];
    }
    renderAddresses();
  }

  function renderAddresses() {
    const container = $('coAddressList');
    if (!container) return;
    let html = '<div class="co-saved-addresses">';
    if (state.addresses.length) {
      state.addresses.forEach((addr, i) => {
        const selected = state.address && state.address.id === addr.id ? ' selected' : '';
        html += `<div class="co-address-card${selected}" onclick="window._coSelectAddress(${i})">
          <label>
            <input type="radio" name="co_addr" ${selected ? 'checked' : ''}>
            <div>
              <div class="addr-label">${addr.label || 'Home'}</div>
              <div class="addr-name">${addr.full_name}</div>
              <div class="addr-detail">${formatAddress(addr)}${addr.zip_code ? ' - ' + addr.zip_code : ''}</div>
              <div class="addr-detail">Phone: ${addr.phone}</div>
              <div class="addr-actions">
                <button onclick="event.stopPropagation();window._coEditAddress(${i})">Edit</button>
                <button class="danger" onclick="event.stopPropagation();window._coDeleteAddress(${i})">Delete</button>
              </div>
            </div>
          </label>
        </div>`;
      });
    }
    html += '</div>';
    html += '<button class="co-add-address-btn" onclick="window._coShowAddressForm()"><i class="fas fa-plus"></i> Add New Address</button>';
    container.innerHTML = html;
  }

  function selectAddress(i) {
    state.address = state.addresses[i];
    document.querySelectorAll('.co-address-card').forEach((el, idx) => el.classList.toggle('selected', idx === i));
    document.querySelectorAll('.co-address-card input[type="radio"]').forEach((el, idx) => el.checked = idx === i);
  }
  window._coSelectAddress = selectAddress;

  function showAddressForm(data) {
    const container = $('coAddressForm');
    if (!container) return;
    container.classList.remove('co-hidden');
    const isEdit = data && data.id;
    container.querySelector('.co-card-title').textContent = isEdit ? 'Edit Address' : 'New Address';
    $('addrFullName').value = data ? (data.full_name || '') : '';
    $('addrPhone').value = data ? (data.phone || '') : '';
    $('addrEmail').value = data ? (data.email || '') : '';
    $('addrProvince').value = data ? (data.state || data.province || '') : '';
    populateDistricts();
    $('addrDistrict').value = data ? (data.district || data.city || '') : '';
    populateMunicipalities();
    $('addrMunicipality').value = data ? (data.municipality || '') : '';
    $('addrWard').value = data ? (data.ward || '') : '';
    $('addrStreet').value = data ? (data.tole || '') : '';
    $('addrLandmark').value = data ? (data.landmark || '') : '';
    $('addrZip').value = data ? (data.zip_code || '') : '';
    $('addrLabel').value = data ? (data.label || 'Home') : 'Home';
    $('coAddressForm').dataset.editId = data ? data.id : '';
    $('coAddressForm').dataset.editIndex = data && data._index !== undefined ? data._index : '';
  }
  window._coShowAddressForm = function(data) { showAddressForm(data); };

  function saveAddress() {
    const fullName = $('addrFullName').value.trim();
    const phone = $('addrPhone').value.trim();
    const email = $('addrEmail').value.trim();
    const province = $('addrProvince').value;
    const district = $('addrDistrict').value;
    const municipality = $('addrMunicipality').value;
    const ward = $('addrWard').value.trim();
    const tole = $('addrStreet').value.trim();
    const landmark = $('addrLandmark').value.trim();
    const zip = $('addrZip').value.trim();
    const label = $('addrLabel').value;
    if (!fullName) { showToast('Full name is required', 'error'); return; }
    if (!phone) { showToast('Phone number is required', 'error'); return; }
    if (!province) { showToast('Please select a province', 'error'); return; }
    if (!district) { showToast('Please select a district', 'error'); return; }
    if (!municipality) { showToast('Please select a municipality', 'error'); return; }
    if (!ward && !tole) { showToast('Ward number or Tole/Street is required', 'error'); return; }
    const address = [tole, ward ? 'Ward ' + ward : '', municipality, district].filter(Boolean).join(', ');
    const user = getCurrentUser();
    if (!user) { showToast('Please sign in first', 'error'); return; }
    const addrData = {
      full_name: fullName, phone, email,
      state: province, city: district,
      district, municipality, ward, tole, landmark,
      address, zip_code: zip, label, country: 'Nepal'
    };
    const editId = $('coAddressForm').dataset.editId;
    const token = getToken();
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? API_ADDR + '/' + editId : API_ADDR;
    fetch(url, {
      method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(addrData)
    }).then(r => r.json()).then(d => {
      if (d.error) { showToast(d.error, 'error'); return; }
      showToast(editId ? 'Address updated' : 'Address saved', 'success');
      $('coAddressForm').classList.add('co-hidden');
      loadAddresses();
      if (!editId) state.address = { ...addrData, id: d.id || Date.now() };
    }).catch(() => showToast('Failed to save address', 'error'));
  }

  function deleteAddress(i) {
    const addr = state.addresses[i];
    if (!addr || !addr.id) return;
    const token = getToken();
    fetch(API_ADDR + '/' + addr.id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => {
        if (!r.ok) throw new Error();
        showToast('Address deleted', 'success');
        if (state.address && state.address.id === addr.id) state.address = null;
        loadAddresses();
      }).catch(() => showToast('Failed to delete address', 'error'));
  }
  window._coDeleteAddress = deleteAddress;

  function editAddress(i) {
    const addr = { ...state.addresses[i], _index: i };
    showAddressForm(addr);
  }
  window._coEditAddress = editAddress;

  // ==================== SHIPPING ====================
  function renderShipping() {
    const container = $('coDeliveryOptions');
    if (!container) return;
    let html = '<div class="co-delivery-options">';
    shippingMethods.forEach(m => {
      const selected = state.shipping.method === m.id ? ' selected' : '';
      const costLabel = m.cost === 0 ? '<span class="co-delivery-cost free">Free</span>' : '<span class="co-delivery-cost">Rs. ' + m.cost.toLocaleString() + '</span>';
      const freeEligible = getSubtotal() >= 2000 && m.id === 'standard';
      const displayCost = freeEligible ? '<span class="co-delivery-cost free">Free</span>' : costLabel;
      html += `<div class="co-delivery-option${selected}" onclick="window._coSelectShipping('${m.id}')">
        <label>
          <input type="radio" name="co_shipping" ${selected ? 'checked' : ''}>
          <div class="co-delivery-info">
            <div class="co-delivery-name">${m.label}</div>
            <div class="co-delivery-eta">${m.eta}${freeEligible ? ' · Free shipping on orders above Rs. 2,000' : ''}</div>
          </div>
          ${displayCost}
        </label>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function selectShipping(id) {
    const method = shippingMethods.find(m => m.id === id);
    if (!method) return;
    state.shipping = method;
    document.querySelectorAll('.co-delivery-option').forEach(el => el.classList.toggle('selected', el.querySelector('input').value === id || false));
    document.querySelectorAll('.co-delivery-option input').forEach(el => el.checked = el.value === id);
    updateSummary();
  }
  window._coSelectShipping = selectShipping;

  // ==================== PAYMENT ====================
  function renderPayment() {
    const container = $('coPaymentOptions');
    if (!container) return;
    let html = '<div class="co-payment-options">';
    paymentMethods.forEach(m => {
      const selected = state.payment === m.id ? ' selected' : '';
      html += `<div class="co-payment-option${selected}" onclick="window._coSelectPayment('${m.id}')">
        <i class="fas ${m.icon}"></i>
        <span>${m.label}</span>
        <span class="pay-label">${m.desc}</span>
      </div>`;
    });
    html += '</div><div class="co-payment-logos" style="margin-top:10px;"><span>Visa</span><span>Mastercard</span><span>eSewa</span><span>Khalti</span><span>Fonepay</span><span>COD</span></div>';
    container.innerHTML = html;
  }

  function selectPayment(id) {
    state.payment = id;
    document.querySelectorAll('.co-payment-option').forEach(el => el.classList.toggle('selected', el.dataset.value === id));
  }
  window._coSelectPayment = selectPayment;

  // ==================== COUPON ====================
  async function applyCoupon() {
    const input = $('coCouponInput');
    const code = input.value.trim();
    if (!code) { showToast('Enter a coupon code', 'warning'); return; }
    const btn = $('coCouponBtn');
    btn.disabled = true; btn.textContent = '...';
    try {
      const res = await fetch(API_COUPON, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, order_total: String(getSubtotal()) })
      });
      const d = await res.json();
      if (!res.ok) {
        $('coCouponError').textContent = d.error || 'Invalid coupon';
        $('coCouponError').classList.add('show');
        return;
      }
      state.coupon = d.coupon;
      state.discount = d.discount;
      $('coCouponApplied').classList.remove('co-hidden');
      $('coCouponApplied').querySelector('.co-coupon-code').textContent = d.coupon;
      $('coCouponApplied').querySelector('.co-coupon-amount').textContent = '-Rs. ' + d.discount.toLocaleString();
      $('coCouponError').classList.remove('show');
      input.value = '';
      showToast('Coupon applied!', 'success');
      updateSummary();
    } catch { showToast('Failed to validate coupon', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Apply'; }
  }

  function removeCoupon() {
    state.coupon = null; state.discount = 0;
    $('coCouponApplied').classList.add('co-hidden');
    updateSummary();
    showToast('Coupon removed', 'info');
  }

  // ==================== SUMMARY ====================
  function updateSummary() {
    const sub = getSubtotal();
    const ship = getShippingCost();
    const disc = getDiscount();
    const total = getTotal();
    const freeShip = sub >= 2000;
    const displayShip = freeShip && state.shipping.id === 'standard' ? 0 : ship;
    const finalTotal = Math.max(0, sub + displayShip - disc);

    if ($('coSummarySubtotal')) $('coSummarySubtotal').textContent = 'Rs. ' + sub.toLocaleString();
    if ($('coSummaryShipping')) {
      $('coSummaryShipping').textContent = displayShip === 0 ? 'Free' : 'Rs. ' + displayShip.toLocaleString();
      $('coSummaryShipping').style.color = displayShip === 0 ? 'var(--co-success)' : '';
    }
    if ($('coSummaryDiscount')) {
      if (disc > 0) {
        $('coSummaryDiscount').parentElement.style.display = '';
        $('coSummaryDiscount').textContent = '-Rs. ' + disc.toLocaleString();
      } else {
        $('coSummaryDiscount').parentElement.style.display = 'none';
      }
    }
    if ($('coSummaryTotal')) $('coSummaryTotal').textContent = 'Rs. ' + finalTotal.toLocaleString();
    if ($('coSummaryCount')) $('coSummaryCount').textContent = state.cart.reduce((s, c) => s + (c.qty || 1), 0) + ' item(s)';
    renderMiniCart();
  }

  function renderMiniCart() {
    const container = $('coSummaryItems');
    if (!container) return;
    container.innerHTML = state.cart.map(item => {
      const img = item.icon || item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
      const variant = [item.size, item.color].filter(Boolean).join(', ');
      return `<div class="co-summary-mini-item">
        <div class="co-summary-mini-img"><img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'"></div>
        <div class="co-summary-mini-info">
          <div class="co-summary-mini-name">${item.name}</div>
          ${variant ? '<div class="co-summary-mini-variant">' + variant + '</div>' : ''}
          <div class="co-summary-mini-qty">Qty: ${item.qty || 1}</div>
        </div>
        <div class="co-summary-mini-price">Rs. ${((parseFloat(item.price) || 0) * (item.qty || 1)).toLocaleString()}</div>
      </div>`;
    }).join('');
  }

  // ==================== REVIEW ====================
  function renderReview() {
    const container = $('coReviewContent');
    if (!container) return;
    const addr = state.address;
    const freeShip = getSubtotal() >= 2000 && state.shipping.id === 'standard';
    const displayShip = freeShip ? 0 : state.shipping.cost;
    container.innerHTML = `
      <div class="co-card" style="margin-bottom:12px;">
        <div class="co-card-title">Shipping Address</div>
        ${addr ? `<p style="font-size:0.9rem;color:var(--co-text-secondary);">${addr.full_name}, ${addr.phone}${addr.email ? '<br>Email: ' + addr.email : ''}<br>${formatAddress(addr)}</p>` : '<p style="color:var(--co-error);">No address selected</p>'}
      </div>
      <div class="co-card" style="margin-bottom:12px;">
        <div class="co-card-title">Delivery Method</div>
        <p style="font-size:0.9rem;color:var(--co-text-secondary);">${state.shipping.label} · ${state.shipping.eta} · ${displayShip === 0 ? 'Free' : 'Rs. ' + displayShip.toLocaleString()}</p>
      </div>
      <div class="co-card" style="margin-bottom:12px;">
        <div class="co-card-title">Payment Method</div>
        <p style="font-size:0.9rem;color:var(--co-text-secondary);">${paymentMethods.find(m => m.id === state.payment)?.label || state.payment}</p>
      </div>
      <div class="co-card">
        <div class="co-card-title">Items (${state.cart.reduce((s, c) => s + (c.qty || 1), 0)})</div>
        ${state.cart.map(item => {
          const img = item.icon || item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&q=80';
          const variant = [item.size, item.color].filter(Boolean).join(', ');
          return `<div class="co-summary-mini-item">
            <div class="co-summary-mini-img"><img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'"></div>
            <div class="co-summary-mini-info">
              <div class="co-summary-mini-name">${item.name}</div>
              ${variant ? '<div class="co-summary-mini-variant">' + variant + '</div>' : ''}
              <div class="co-summary-mini-qty">Qty: ${item.qty || 1} × Rs. ${parseFloat(item.price).toLocaleString()}</div>
            </div>
            <div class="co-summary-mini-price">Rs. ${((parseFloat(item.price) || 0) * (item.qty || 1)).toLocaleString()}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // ==================== PLACE ORDER ====================
  async function placeOrder() {
    if (state.loading) return;
    if (!state.cart.length) { showToast('Your cart is empty', 'error'); return; }
    if (!state.address) { showToast('Please select a shipping address', 'error'); goToStep(3); return; }

    state.loading = true;
    const btn = $('coPlaceOrderBtn');
    btn.disabled = true; btn.classList.add('loading');

    const sub = getSubtotal();
    const freeShip = sub >= 2000 && state.shipping.id === 'standard';
    const displayShip = freeShip ? 0 : state.shipping.cost;
    const finalTotal = Math.max(0, sub + displayShip - state.discount);
    const user = getCurrentUser();

    const items = state.cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      quantity: item.qty || 1,
      unit_price: String(item.price),
      size: item.size || '',
      color: item.color || ''
    }));

    const body = {
      customer_name: state.address.full_name || user?.name || 'Guest',
      customer_phone: state.address.phone || user?.phone || '',
      customer_email: state.address.email || user?.email || '',
      customer_address: formatAddress(state.address),
      customer_province: state.address.state || state.address.province || '',
      customer_district: state.address.district || state.address.city || '',
      customer_municipality: state.address.municipality || '',
      customer_ward: state.address.ward || '',
      customer_tole: state.address.tole || '',
      customer_landmark: state.address.landmark || '',
      payment_method: state.payment,
      shipping_method: state.shipping.label,
      shipping_cost: displayShip,
      notes: '',
      items,
      subtotal: String(sub),
      discount: String(state.discount),
      coupon_code: state.coupon || '',
      total_amount: String(finalTotal)
    };

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const res = await fetch(API_ORDERS, { method: 'POST', headers, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to place order');
      state.orderId = d.order_id;
      state.cart = [];
      localStorage.removeItem('aryal_cart');
      showConfirmation(d.order_id, finalTotal);
      showToast('Order placed successfully!', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      state.loading = false;
      btn.disabled = false; btn.classList.remove('loading');
    }
  }

  function showConfirmation(orderId, total) {
    const container = $('coMainContent');
    if (!container) return;
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (state.shipping.id === 'same_day' ? 0 : state.shipping.id === 'express' ? 3 : 7));
    const addr = state.address;

    container.innerHTML = `
      <div class="co-steps" id="coSteps"></div>
      <div class="co-card">
        <div class="co-confirmation">
          <div class="co-confirmation-icon"><i class="fas fa-check"></i></div>
          <h2>Order Confirmed!</h2>
          <p class="order-id">Order ID: <strong>#${orderId}</strong></p>
          <p class="delivery-estimate">Estimated delivery: ${days[deliveryDate.getDay()]}, ${deliveryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
          <div class="co-confirmation-details">
            <div class="detail-row"><span class="detail-label">Payment</span><span>${paymentMethods.find(m => m.id === state.payment)?.label || state.payment}</span></div>
            <div class="detail-row"><span class="detail-label">Payment Status</span><span>${state.payment === 'cod' ? 'Pending' : 'Processing'}</span></div>
            <div class="detail-row"><span class="detail-label">Total Charged</span><span>Rs. ${total.toLocaleString()}</span></div>
            <div class="detail-row"><span class="detail-label">Shipping</span><span>${addr ? addr.full_name + ', ' + addr.address : ''}</span></div>
          </div>
          <div class="co-confirmation-actions">
            <a href="/" class="co-btn co-btn-primary co-btn-lg">Continue Shopping</a>
            <a href="?track=${orderId}" class="co-btn co-btn-secondary co-btn-lg">View Order</a>
          </div>
        </div>
      </div>
    `;

    document.querySelector('.co-page').style.gridTemplateColumns = '1fr';
    const summary = $('coSummary');
    if (summary) summary.style.display = 'none';
  }

  // ==================== EVENTS ====================
  function bindEvents() {
    // Step navigation
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-goto]');
      if (btn) {
        const step = parseInt(btn.dataset.goto);
        if (step === 3 && !getCurrentUser()) { openAuthModal(); return; }
        if (step === 3 && getCurrentUser()) { loadAddresses(); }
        if (step === 4 && !state.address) { showToast('Please select a shipping address', 'error'); return; }
        goToStep(step);
      }
    });

    // Auth modal
    document.addEventListener('click', function(e) {
      if (e.target.id === 'coShowSignup') { e.preventDefault(); $('coAuthLoginForm').style.display = 'none'; $('coAuthSignupForm').style.display = 'block'; }
      if (e.target.id === 'coShowLogin') { e.preventDefault(); $('coAuthLoginForm').style.display = 'block'; $('coAuthSignupForm').style.display = 'none'; }
    });

    $('coAuthLoginBtn').addEventListener('click', async function() {
      const email = $('coAuthEmail').value.trim();
      const password = $('coAuthPassword').value;
      if (!email || !password) { showToast('Please fill in all fields', 'error'); return; }
      this.disabled = true; this.innerHTML = '<span class="spinner"></span> Signing In...';
      await authLogin(email, password);
      this.disabled = false; this.textContent = 'Sign In';
    });

    $('coAuthSignupBtn').addEventListener('click', async function() {
      const first = $('coAuthFirstName').value.trim();
      const last = $('coAuthLastName').value.trim();
      const email = $('coAuthRegEmail').value.trim();
      const phone = $('coAuthPhone').value.trim();
      const password = $('coAuthRegPassword').value;
      if (!first || !last || !email || !password) { showToast('Please fill in all fields', 'error'); return; }
      this.disabled = true; this.innerHTML = '<span class="spinner"></span> Creating...';
      await authRegister({ name: first + ' ' + last, email, phone, password });
      this.disabled = false; this.textContent = 'Create Account';
    });

    // Coupon
    $('coCouponBtn').addEventListener('click', applyCoupon);
    $('coCouponInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') applyCoupon(); });
    document.addEventListener('click', function(e) {
      if (e.target.closest('#coRemoveCoupon')) { e.preventDefault(); removeCoupon(); }
    });

    // Address form
    $('coSaveAddressBtn').addEventListener('click', saveAddress);
    $('coCancelAddressBtn').addEventListener('click', function() { $('coAddressForm').classList.add('co-hidden'); });
    $('addrProvince').addEventListener('change', populateDistricts);
    $('addrDistrict').addEventListener('change', populateMunicipalities);

    // Place order
    $('coPlaceOrderBtn').addEventListener('click', placeOrder);

    // Continue shopping from step 1
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-continue-shopping]')) {
        window.location.href = '/';
      }
    });
  }

  // ==================== START ====================
  document.addEventListener('DOMContentLoaded', function() {
    init();
  });

})();
