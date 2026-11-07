(function () {
  'use strict';

  // Runs inside the Capacitor Android/iOS shell. On the normal website
  // window.Capacitor is undefined, so this file does nothing there.

  var capacitor = window.Capacitor;
  if (!capacitor || !capacitor.Plugins || !capacitor.Plugins.PushNotifications) return;

  var PushNotifications = capacitor.Plugins.PushNotifications;
  var platform = 'android';
  try { if (typeof capacitor.getPlatform === 'function') platform = capacitor.getPlatform(); } catch (e) {}

  var lastRegisterAt = 0;

  function adminToken() { return localStorage.getItem('aryal_admin_token') || ''; }
  function userToken() { return localStorage.getItem('aryal_token') || ''; }

  function currentPhone() {
    try {
      var user = JSON.parse(localStorage.getItem('aryal_user') || 'null');
      if (user && user.phone) return user.phone;
    } catch (e) {}
    return localStorage.getItem('aryal_last_order_phone') || '';
  }

  function postToken(token) {
    if (!token) return Promise.resolve();
    lastRegisterAt = Date.now();
    var headers = { 'Content-Type': 'application/json' };
    var auth = adminToken() || userToken();
    if (auth) headers.Authorization = 'Bearer ' + auth;
    var payload = {
      token: token,
      platform: platform,
      role: adminToken() ? 'admin' : 'customer',
      phone: adminToken() ? '' : currentPhone(),
      sessionId: localStorage.getItem('aryal_session_id') || ''
    };
    return fetch('/api/push/register', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).catch(function () {});
  }

  function openLink(link) {
    if (!link) return;
    try {
      var url = new URL(link, window.location.origin);
      if (url.origin !== window.location.origin) return;
      window.location.href = url.href;
    } catch (e) {
      window.location.href = link;
    }
  }

  function setup() {
    if (platform === 'android' && typeof PushNotifications.createChannel === 'function') {
      PushNotifications.createChannel({
        id: 'aryal_orders',
        name: 'Orders & offers',
        description: 'Order updates, price offers, payments and refunds',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true
      }).catch(function () {});
    }

    PushNotifications.addListener('registration', function (token) {
      postToken(token && token.value);
    });

    PushNotifications.addListener('registrationError', function (error) {
      if (window.console && console.warn) console.warn('Push registration failed:', error);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', function (action) {
      var data = (action && action.notification && action.notification.data) || {};
      openLink(data.link || data.url || '');
    });

    PushNotifications.addListener('pushNotificationReceived', function (notification) {
      if (window.console && console.log) console.log('Push received:', notification);
    });

    PushNotifications.checkPermissions().then(function (status) {
      if (status && status.receive === 'granted') return status;
      return PushNotifications.requestPermissions();
    }).then(function (status) {
      if (status && status.receive === 'granted') return PushNotifications.register();
      return null;
    }).catch(function (error) {
      if (window.console && console.warn) console.warn('Push permission failed:', error);
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastRegisterAt < 60000) return;
    PushNotifications.register().catch(function () {});
  });

  window.AryalPush = {
    register: function () { return PushNotifications.register().catch(function () {}); },
    updatePhone: function () { return PushNotifications.register().catch(function () {}); }
  };

  var App = capacitor.Plugins.App;
  if (App && typeof App.addListener === 'function') {
    App.addListener('backButton', function () {
      if (window.history.length > 1) window.history.back();
      else if (typeof App.exitApp === 'function') App.exitApp();
    });
  }

  setup();
})();
