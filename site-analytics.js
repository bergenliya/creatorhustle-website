/* Google Analytics: load only after an explicit analytics consent choice. */
(function () {
  'use strict';
  if (window.creatorHustleAnalytics) return;
  window.creatorHustleAnalytics = true;
  var id = 'G-3YKBENZVKT';
  var key = 'creatorhustle-analytics-consent-v1';
  var loaded = false;
  var choice = null;
  try {
    var saved = JSON.parse(localStorage.getItem(key));
    if (saved && saved.expires > Date.now()) choice = saved.value;
  } catch (e) { /* Storage can be unavailable in private browsers. */ }
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied'
  });
  function start() {
    window['ga-disable-' + id] = false;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    if (loaded) return;
    loaded = true;
    window.gtag('js', new Date());
    window.gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 15552000,
      page_location: location.origin + location.pathname,
      page_referrer: document.referrer ? document.referrer.split('?')[0].split('#')[0] : ''
    });
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(tag);
  }
  function clearCookies() {
    document.cookie.split(';').forEach(function (item) {
      var name = item.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) return;
      ['', location.hostname, '.' + location.hostname, '.creatorhustle.ai'].forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
      });
    });
  }
  function save(value) {
    choice = value;
    try { localStorage.setItem(key, JSON.stringify({ value: value, expires: Date.now() + 15552000000 })); } catch (e) {}
    if (value === 'accepted') start();
    else {
      window['ga-disable-' + id] = true;
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      clearCookies();
    }
    panel.hidden = true;
    settings.focus();
  }
  var style = document.createElement('style');
  style.textContent = '#ch-consent{position:fixed;bottom:16px;left:16px;right:16px;max-width:600px;margin:auto;z-index:10000;background:#fff;color:#202020;padding:20px;border:1px solid #ccc;border-radius:16px;box-shadow:0 8px 32px #0003;font:15px/1.5 system-ui,sans-serif}#ch-consent[hidden]{display:none}#ch-consent p{margin:8px 0 16px}#ch-consent a{color:#7d2456;text-decoration:underline}#ch-consent button{font:inherit;cursor:pointer;border:1px solid #7d2456;border-radius:8px;background:#fff;color:#7d2456;padding:9px 16px;margin:0 8px 0 0}#ch-consent button:focus-visible,#ch-cookie-settings:focus-visible{outline:3px solid #247bbd;outline-offset:3px}#ch-cookie-settings{position:fixed;bottom:8px;left:8px;z-index:9999;font:12px/1.4 system-ui,sans-serif;color:#333;background:#fff;border:1px solid #bbb;border-radius:6px;padding:6px 10px;cursor:pointer}';
  document.head.appendChild(style);
  var panel = document.createElement('section');
  panel.id = 'ch-consent';
  panel.setAttribute('aria-label', 'Analytics cookie preferences');
  panel.innerHTML = '<strong>A quick cookie choice</strong><p>May we use Google Analytics cookies to understand which pages people visit and improve this website? Analytics stays off unless you accept. <a href="/privacy-policy.html">Privacy policy</a></p><button type="button" data-choice="accepted">Accept analytics</button><button type="button" data-choice="rejected">Reject analytics</button>';
  panel.hidden = choice === 'accepted' || choice === 'rejected';
  panel.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-choice]');
    if (button) save(button.getAttribute('data-choice'));
  });
  var settings = document.createElement('button');
  settings.id = 'ch-cookie-settings';
  settings.type = 'button';
  settings.textContent = 'Cookie settings';
  settings.addEventListener('click', function () {
    panel.hidden = false;
    panel.querySelector('button').focus();
  });
  document.body.appendChild(settings);
  document.body.appendChild(panel);
  if (choice === 'accepted') start();
  else { window['ga-disable-' + id] = true; clearCookies(); }
  window.addEventListener('storage', function (event) {
    if (event.key === key) location.reload();
  });
})();
