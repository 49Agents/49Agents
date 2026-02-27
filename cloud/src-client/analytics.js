(function() {
  // Generate or reuse a session ID (no cookies, sessionStorage only)
  var sid = sessionStorage.getItem('_49a_sid');
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('_49a_sid', sid);
  }

  // Capture UTM parameters from the URL
  var params = new URLSearchParams(location.search);
  var utmSource = params.get('utm_source') || null;
  var utmMedium = params.get('utm_medium') || null;
  var utmCampaign = params.get('utm_campaign') || null;

  // Persist utm_source in a cookie so it survives OAuth redirects
  if (utmSource) {
    document.cookie = '_49a_utm=' + encodeURIComponent(utmSource) + ';path=/;max-age=3600;SameSite=Lax';
  }

  var data = JSON.stringify({
    path: location.pathname,
    referrer: document.referrer || '',
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    sessionId: sid,
    hostname: location.hostname,
    utmSource: utmSource,
    utmMedium: utmMedium,
    utmCampaign: utmCampaign,
  });

  // Prefer sendBeacon for reliability (fires even on page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/track', new Blob([data], { type: 'application/json' }));
  } else {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true,
    }).catch(function() {});
  }
})();
