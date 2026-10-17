(function () {
  'use strict';

  var API = '/api/orders';
  var params = new URLSearchParams(window.location.search);
  var code = params.get('code') || '';
  var token = params.get('token') || '';
  var payConfig = null;

  var STATUS_LABELS = {
    REQUESTED: 'Request Received',
    UNDER_REVIEW: 'Under Review',
    DELIVERY_CHECK: 'Checking Delivery',
    AWAITING_APPROVAL: 'Awaiting Your Approval',
    CONFIRMED: 'Confirmed',
    PREPARING: 'Preparing',
    READY_FOR_PICKUP: 'Ready for Pickup',
    DISPATCHED: 'Dispatched',
    DELIVERED: 'Delivered',
    DELIVERY_FAILED: 'Delivery Failed',
    CANCELLED: 'Cancelled',
    REFUND_PENDING: 'Refund Pending',
    REFUNDED: 'Refunded'
  };
  var STATUS_COLORS = {
    REQUESTED: '#111111',
    UNDER_REVIEW: '#111111',
    DELIVERY_CHECK: '#111111',
    AWAITING_APPROVAL: '#111111',
    CONFIRMED: '#2F7D4F',
    PREPARING: '#2980b9',
    READY_FOR_PICKUP: '#2980b9',
    DISPATCHED: '#8e44ad',
    DELIVERED: '#2F7D4F',
    DELIVERY_FAILED: '#B23A2E',
    CANCELLED: '#95a5a6',
    REFUND_PENDING: '#e67e22',
    REFUNDED: '#7f8c8d'
  };
  var PROGRESS = ['REQUESTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL', 'CONFIRMED', 'PREPARING', 'DISPATCHED', 'DELIVERED'];
  var PROGRESS_ICONS = ['fa-paper-plane', 'fa-clipboard-list', 'fa-handshake', 'fa-check', 'fa-box', 'fa-truck', 'fa-house'];

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(n) { return 'Rs. ' + (Number(n) || 0).toLocaleString(); }
  function label(status) { return STATUS_LABELS[status] || status || 'Unknown'; }
  function color(status) { return STATUS_COLORS[status] || '#666666'; }
  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function toast(msg, type) {
    var box = $('trToasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'co-toast ' + (type || 'info');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function progressIndex(status) {
    var i = PROGRESS.indexOf(status);
    if (i !== -1) return i;
    if (status === 'READY_FOR_PICKUP') return PROGRESS.indexOf('DISPATCHED');
    if (status === 'DELIVERY_FAILED') return PROGRESS.indexOf('DISPATCHED');
    if (status === 'REFUND_PENDING' || status === 'REFUNDED') return PROGRESS.length - 1;
    if (status === 'CANCELLED') return -1;
    return 0;
  }

  function renderLookup(message) {
    $('trackMain').innerHTML =
      '<div class="co-card">' +
        '<div class="co-card-title"><i class="fas fa-magnifying-glass"></i> Find Your Order</div>' +
        '<div class="co-card-subtitle">Enter the reference code from your confirmation and your tracking link.</div>' +
        (message ? '<div style="background:#F7F7F7;color:#B23A2E;border-radius:8px;padding:12px;margin-bottom:14px;">' + esc(message) + '</div>' : '') +
        '<div class="tr-field"><label>Reference code</label><input id="trCodeInput" placeholder="ARY-000000-XXXX" value="' + esc(code) + '"></div>' +
        '<div class="tr-field"><label>Tracking token</label><input id="trTokenInput" placeholder="Paste the token from your tracking link" value="' + esc(token) + '"></div>' +
        '<button class="co-btn co-btn-primary co-btn-lg" id="trLookupBtn" style="width:100%;">Track Order</button>' +
      '</div>';
    $('trLookupBtn').addEventListener('click', function () {
      var c = $('trCodeInput').value.trim();
      var t = $('trTokenInput').value.trim();
      if (!c || !t) { toast('Enter both the reference code and tracking token.', 'error'); return; }
      code = c; token = t;
      history.replaceState(null, '', '?code=' + encodeURIComponent(c) + '&token=' + encodeURIComponent(t));
      load();
    });
  }

  function progressBar(status) {
    var idx = progressIndex(status);
    var html = '<div class="tr-progress">';
    for (var i = 0; i < PROGRESS.length; i++) {
      var cls = '';
      if (idx >= 0) {
        if (i < idx) cls = 'done';
        else if (i === idx) cls = 'active';
      }
      html += '<div class="tr-step ' + cls + '">' +
        '<div class="tr-dot"><i class="fas ' + PROGRESS_ICONS[i] + '"></i></div>' +
        '<div class="tr-step-label">' + esc(label(PROGRESS[i])) + '</div>' +
      '</div>';
    }
    html += '</div>';
    return html;
  }

  function itemsHtml(items) {
    if (!items || !items.length) return '<div class="tr-muted">No items listed.</div>';
    return items.map(function (it) {
      var name = it.product_name || it.name || 'Item';
      var qty = it.quantity || it.qty || 1;
      var price = it.unit_price != null ? it.unit_price : (it.price != null ? it.price : null);
      var variant = [it.size, it.color].filter(Boolean).join(' / ');
      return '<div class="tr-item">' +
        '<div><div>' + esc(name) + '</div>' +
          (variant ? '<div class="tr-item-variant">' + esc(variant) + '</div>' : '') +
          '<div class="tr-item-variant">Qty: ' + esc(qty) + (price != null ? ' &middot; ' + money(price) + ' each' : '') + '</div>' +
        '</div>' +
        '<div>' + (price != null ? money((Number(price) || 0) * (Number(qty) || 1)) : '') + '</div>' +
      '</div>';
    }).join('');
  }

  function totalsHtml(o) {
    var rows = '';
    if (o.subtotal != null) rows += '<div class="tr-row"><span>Subtotal</span><span>' + money(o.subtotal) + '</span></div>';
    if (o.discount && Number(o.discount) > 0) rows += '<div class="tr-row"><span>Discount</span><span>-' + money(o.discount) + '</span></div>';
    if (o.delivery_fee != null) rows += '<div class="tr-row"><span>Delivery</span><span>' + (Number(o.delivery_fee) > 0 ? money(o.delivery_fee) : 'Free') + '</span></div>';
    var total = o.total != null ? o.total : o.amount;
    rows += '<div class="tr-row total"><span>Total</span><span>' + money(total) + '</span></div>';
    return rows;
  }

  function timelineHtml(timeline) {
    if (!timeline || !timeline.length) return '';
    var items = timeline.slice().reverse().map(function (t) {
      return '<div class="tr-tl-item">' +
        '<div class="tr-tl-note">' + esc(t.note || t.label || label(t.status)) + '</div>' +
        '<div class="tr-tl-date">' + esc(fmtDate(t.created_at)) + '</div>' +
      '</div>';
    }).join('');
    return '<div class="co-card"><div class="co-card-title"><i class="fas fa-clock-rotate-left"></i> Order Activity</div><div class="tr-timeline">' + items + '</div></div>';
  }

  function offerHtml(o) {
    var offer = o.offer;
    if (!offer) return '';
    var expired = offer.expires_at && new Date(offer.expires_at).getTime() < Date.now();
    var rows = '';
    if (offer.subtotal != null) rows += '<div class="tr-row"><span>Items</span><span>' + money(offer.subtotal) + '</span></div>';
    if (offer.discount != null && Number(offer.discount) > 0) rows += '<div class="tr-row"><span>Discount</span><span>-' + money(offer.discount) + '</span></div>';
    if (offer.delivery_fee != null) rows += '<div class="tr-row"><span>Delivery</span><span>' + (Number(offer.delivery_fee) > 0 ? money(offer.delivery_fee) : 'Free') + '</span></div>';
    if (offer.delivery_label) rows += '<div class="tr-row"><span>Delivery method</span><span>' + esc(offer.delivery_label) + '</span></div>';
    if (offer.delivery_eta) rows += '<div class="tr-row"><span>Estimated delivery</span><span>' + esc(offer.delivery_eta) + '</span></div>';
    if (offer.total != null) rows += '<div class="tr-row total"><span>Final total</span><span>' + money(offer.total) + '</span></div>';
    if (offer.message) rows += '<div class="tr-muted" style="margin-top:8px;">' + esc(offer.message) + '</div>';
    if (offer.expires_at) rows += '<div class="tr-muted" style="margin-top:6px;">' + (expired ? 'This offer has expired.' : 'Offer valid until ' + esc(fmtDate(offer.expires_at)) + '.') + '</div>';

    var title = o.status === 'AWAITING_APPROVAL' ? 'Your Final Offer' : 'Offer Details';
    return '<div class="co-card">' +
      '<div class="co-card-title"><i class="fas fa-file-invoice-dollar"></i> ' + title + '</div>' +
      '<div class="tr-offer">' + rows + '</div>' +
    '</div>';
  }

  function paymentHtml(o) {
    var status = (o.payment_status || 'UNPAID').toUpperCase();
    if (status === 'PAID') {
      return '<div class="co-card"><div class="co-card-title"><i class="fas fa-circle-check" style="color:#2F7D4F;"></i> Payment Received</div>' +
        '<div class="tr-muted">We have received your payment. Thank you!</div></div>';
    }
    if ((o.payment_method || 'online') !== 'online') {
      var methodText = o.payment_method === 'cash_on_delivery' ? 'Pay cash when your order is delivered.' :
        o.payment_method === 'cash_on_pickup' ? 'Pay cash when you pick up your order.' :
        o.payment_method === 'bank_transfer' ? 'Please transfer to the shop account shown on your confirmation.' :
        'Payment will be arranged with the shop.';
      return '<div class="co-card"><div class="co-card-title"><i class="fas fa-wallet"></i> Payment</div><div class="tr-muted">' + esc(methodText) + '</div></div>';
    }
    if (!payConfig) return '';
    var submitted = status === 'PAYMENT_PENDING' || status === 'SUBMITTED';
    var qrImg = payConfig.qrUrl
      ? '<img src="' + esc(payConfig.qrUrl) + '" alt="Shop payment QR code" onerror="this.outerHTML=\'<div class=&quot;tr-muted&quot;>Shop QR not configured</div>\'">'
      : '<div class="tr-muted"><i class="fas fa-triangle-exclamation"></i> Shop QR code is not configured yet. Please contact the store.</div>';
    return '<div class="co-card">' +
      '<div class="co-card-title"><i class="fas fa-qrcode"></i> Pay for Your Order</div>' +
      '<div class="tr-qr">' + qrImg +
        '<p style="font-size:1.3rem;font-weight:700;margin:12px 0 4px;">' + money(o.total) + '</p>' +
        (payConfig.accountName ? '<div class="tr-row"><span>Account name</span><span>' + esc(payConfig.accountName) + '</span></div>' : '') +
        (payConfig.accountDetails ? '<div class="tr-muted">' + esc(payConfig.accountDetails) + '</div>' : '') +
        '<div class="tr-muted" style="margin:8px 0;">' + esc(payConfig.instructions || 'Scan the QR, pay the exact amount, then tap "I Have Paid".') + '</div>' +
        '<button class="co-btn co-btn-primary co-btn-lg" id="trPaidBtn" ' + (submitted ? 'disabled' : '') + '>' +
          (submitted ? '<i class="fas fa-hourglass-half"></i> Payment submitted for verification' : '<i class="fas fa-check-circle"></i> I Have Paid') +
        '</button>' +
        '<div class="tr-muted" style="margin-top:8px;">Every online payment is verified manually before dispatch.</div>' +
      '</div>' +
    '</div>';
  }

  function actionsHtml(o) {
    var status = o.status;
    var btns = '';
    if (status === 'AWAITING_APPROVAL') {
      btns = '<div class="tr-actions">' +
        '<button class="co-btn co-btn-primary co-btn-lg" id="trApproveBtn"><i class="fas fa-check"></i> Approve &amp; Confirm</button>' +
        '<button class="co-btn co-btn-secondary" id="trChangeBtn"><i class="fas fa-pen"></i> Request a Change</button>' +
        '<button class="co-btn co-btn-secondary" id="trDeclineBtn"><i class="fas fa-xmark"></i> Decline</button>' +
      '</div>';
    } else if (status === 'REQUESTED' || status === 'UNDER_REVIEW' || status === 'DELIVERY_CHECK') {
      btns = '<div class="tr-actions">' +
        '<button class="co-btn co-btn-secondary" id="trCancelBtn"><i class="fas fa-ban"></i> Cancel Request</button>' +
      '</div>';
    } else if (status === 'CONFIRMED' || status === 'PREPARING' || status === 'READY_FOR_PICKUP' || status === 'DISPATCHED') {
      btns = '<div class="tr-muted" style="margin-bottom:14px;">Need to change or cancel this order? Please contact the shop and we will help you.</div>';
    }
    return btns;
  }

  function render(o) {
    var status = o.status || 'REQUESTED';
    var badgeLabel = o.status_label || label(status);
    var badgeColor = o.status_color || color(status);
    var badge = '<span class="tr-status-badge" style="background:' + badgeColor + ';">' + esc(badgeLabel) + '</span>';
    var codeShow = o.order_code || code;

    var html = '';
    html += '<div class="co-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
        '<div><div class="co-card-title" style="margin-bottom:2px;">Order ' + esc(codeShow) + '</div>' +
          '<div class="tr-muted">Placed ' + esc(fmtDate(o.created_at)) + '</div></div>' + badge +
      '</div>' +
      (o.status_description ? '<div class="tr-muted" style="margin:10px 0 0;">' + esc(o.status_description) + '</div>' : '') +
      progressBar(status) +
      (status === 'DELIVERY_FAILED' ? '<div style="background:#F7F7F7;color:#B23A2E;border-radius:8px;padding:10px;margin-top:8px;">Delivery could not be completed. Please contact us to reschedule.</div>' : '') +
      (status === 'CANCELLED' ? '<div style="background:#F7F7F7;border-radius:8px;padding:10px;margin-top:8px;">This order was cancelled.</div>' : '') +
      (status === 'REFUND_PENDING' || status === 'REFUNDED' ? '<div style="background:#F7F7F7;border-radius:8px;padding:10px;margin-top:8px;">A refund is being processed for this order.</div>' : '') +
    '</div>';

    html += offerHtml(o);

    html += '<div class="co-card">' +
      '<div class="co-card-title"><i class="fas fa-bag-shopping"></i> Items</div>' +
      itemsHtml(o.items) +
      '<div style="margin-top:10px;">' + totalsHtml(o) + '</div>' +
    '</div>';

    html += actionsHtml(o);
    html += paymentHtml(o);
    html += timelineHtml(o.timeline);

    $('trackMain').innerHTML = html;
    wireActions(o);
  }

  function wireActions(o) {
    var status = o.status;

    var approve = $('trApproveBtn');
    if (approve) approve.addEventListener('click', function () { act('approve', 'Approve this order? We will prepare it for delivery.', approve); });

    var decline = $('trDeclineBtn');
    if (decline) decline.addEventListener('click', function () { act('decline', 'Decline this order offer?', decline); });

    var change = $('trChangeBtn');
    if (change) change.addEventListener('click', function () {
      var msg = window.prompt('What would you like to change? (e.g. size, colour, delivery details)');
      if (msg === null) return;
      act('request-change', 'Send this change request?', change, { message: msg });
    });

    var cancel = $('trCancelBtn');
    if (cancel) cancel.addEventListener('click', function () {
      if (!window.confirm('Cancel this order request?')) return;
      act('decline', 'Cancel this order request? This cannot be undone.', cancel);
    });

    var paidBtn = $('trPaidBtn');
    if (paidBtn && !paidBtn.disabled) {
      paidBtn.addEventListener('click', function () {
        paidBtn.disabled = true;
        paidBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
        post('/api/orders/' + encodeURIComponent(code) + '/payment-submit', { payment_token: token })
          .then(function (data) { toast(data.message || 'Payment submitted for verification.', 'success'); load(); })
          .catch(function (e) { toast(e.message, 'error'); paidBtn.disabled = false; paidBtn.innerHTML = '<i class="fas fa-check-circle"></i> I Have Paid'; });
      });
    }
  }

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { if (!res.ok) throw new Error(data.error || 'Request failed (status ' + res.status + ')'); return data; }); });
  }

  function act(action, confirmMsg, btn, extra) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    var payload = Object.assign({ tracking_token: token }, extra || {});
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait…'; }
    post(API + '/' + encodeURIComponent(code) + '/' + action, payload)
      .then(function (data) { toast(data.message || 'Done.', 'success'); load(); })
      .catch(function (e) { toast(e.message, 'error'); if (btn) { btn.disabled = false; load(); } });
  }

  function loadPayConfig() {
    if (payConfig) return Promise.resolve(payConfig);
    return fetch('/api/payment-config')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) { payConfig = cfg || {}; return payConfig; });
  }

  function load() {
    if (!code || !token) { renderLookup(); return; }
    $('trackMain').innerHTML = '<div class="co-card"><div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin"></i> Loading your order…</div></div>';
    fetch(API + '/track?code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(token))
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok) { renderLookup(r.data.error || 'We could not find that order.'); return; }
        var o = r.data.order || r.data;
        return loadPayConfig().then(function () { render(o); });
      })
      .catch(function () { renderLookup('Network error. Please try again.'); });
  }

  document.addEventListener('DOMContentLoaded', load);
  if (document.readyState !== 'loading') load();
})();
