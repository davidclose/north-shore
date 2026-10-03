(function () {
  "use strict";

  var REF = { lat: 55.0393, lon: -1.4472 };   // Whitley Bay

  function $(id) { return document.getElementById(id); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function tick() {
    var now = new Date();
    var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    $("clock-date").textContent = days[now.getDay()] + ", " + now.getDate() + " " + months[now.getMonth()];
    $("clock-time").textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  }
  tick();
  setInterval(tick, 15000);

  function timeAgo(ms) {
    var diff = Math.max(0, Date.now() - ms);
    var m = Math.round(diff / 60000);
    if (m < 1) return "just now";
    if (m === 1) return "1 min ago";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h === 1) return "1 hr ago";
    if (h < 24) return h + " hr ago";
    return Math.round(h / 24) + "d ago";
  }

  // ---------- icon system (line icons, currentColor + accent/warm) ----------
  function svg(inner, vb) { return '<svg viewBox="0 0 ' + (vb || 24) + ' ' + (vb || 24) + '" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'; }
  var ICONS = {
    sunny: svg('<circle cx="12" cy="12" r="4.5" fill="var(--warm)"/><g stroke="var(--warm)" stroke-width="1.6" stroke-linecap="round"><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></g>'),
    'partly-cloudy': svg('<circle cx="9" cy="9" r="3.6" fill="var(--warm)"/><path d="M6 19a4.2 4.2 0 0 1-.6-8.35A5 5 0 0 1 15 9.2a3.8 3.8 0 0 1-.6 9.8H6z" fill="var(--ink-faint)" opacity="0.55"/>'),
    cloudy: svg('<path d="M6.5 18.5a4.3 4.3 0 0 1-.6-8.55A5.2 5.2 0 0 1 16 9.8a4 4 0 0 1-.7 10H6.5z" fill="var(--ink-faint)"/>'),
    rain: svg('<path d="M6.5 14.5a4.3 4.3 0 0 1-.6-8.55A5.2 5.2 0 0 1 16 5.8a4 4 0 0 1-.7 10H6.5z" fill="var(--ink-faint)"/><g stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"><path d="M8 18.5l-1.2 3M12.5 18.5l-1.2 3M17 18.5l-1.2 3"/></g>'),
    storm: svg('<path d="M6.5 13.5a4.3 4.3 0 0 1-.6-8.55A5.2 5.2 0 0 1 16 4.8a4 4 0 0 1-.7 10H6.5z" fill="var(--ink-faint)"/><path d="M13 14l-3 5h2.4l-1.6 4.5 4.6-6.2h-2.6L15 14h-2z" fill="var(--warm)"/>'),
    snow: svg('<path d="M6.5 14.5a4.3 4.3 0 0 1-.6-8.55A5.2 5.2 0 0 1 16 5.8a4 4 0 0 1-.7 10H6.5z" fill="var(--ink-faint)"/><g stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"><path d="M8 18v4M6.3 19.3l3.4 1.4M9.7 19.3l-3.4 1.4"/><path d="M16 18v4M14.3 19.3l3.4 1.4M17.7 19.3l-3.4 1.4"/></g>'),
    fog: svg('<g stroke="var(--ink-faint)" stroke-width="1.8" stroke-linecap="round"><path d="M4 9.5h16M4 13h16M4 16.5h16"/></g>'),
    'clear-night': svg('<path d="M15.5 3.5a8 8 0 1 0 5 12A6.3 6.3 0 0 1 15.5 3.5z" fill="var(--accent)"/>'),
    'cloudy-night': svg('<path d="M13.5 4a6 6 0 0 0 3.8 9A5.9 5.9 0 0 1 13.5 4z" fill="var(--accent)"/><path d="M4.5 18.5a4.1 4.1 0 0 1-.5-8.2 5 5 0 0 1 9.6-.9 3.9 3.9 0 0 1-.6 9.1h-8.5z" fill="var(--ink-faint)"/>')
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function setLive(prefix, ok, label) {
    var dot = $(prefix + '-dot');
    dot.className = 'live-dot' + (ok === true ? '' : ok === false ? ' down' : ' stale');
    $(prefix + '-live-text').textContent = label;
  }

  var lastUpdated = {};
  function noteUpdated(key, storedAt) {
    lastUpdated[key] = storedAt || Date.now();
    refreshFooter();
  }
  function refreshFooter() {
    var vals = Object.keys(lastUpdated).map(function (k) { return lastUpdated[k]; });
    if (!vals.length) return;
    var oldest = Math.min.apply(null, vals);
    $('footer-updated').textContent = 'Last refreshed ' + timeAgo(oldest);
  }
  setInterval(refreshFooter, 30000);

  // ================= WEATHER (Open-Meteo forecast, fetched by the page) =================
  // WMO weather codes → [icon, phrase]
  var WMO = { 0:['sunny','Clear'], 1:['sunny','Mainly clear'], 2:['partly-cloudy','Partly cloudy'], 3:['cloudy','Overcast'],
    45:['fog','Fog'], 48:['fog','Freezing fog'], 51:['rain','Light drizzle'], 53:['rain','Drizzle'], 55:['rain','Heavy drizzle'],
    56:['rain','Freezing drizzle'], 57:['rain','Freezing drizzle'], 61:['rain','Light rain'], 63:['rain','Rain'], 65:['rain','Heavy rain'],
    66:['rain','Freezing rain'], 67:['rain','Freezing rain'], 71:['snow','Light snow'], 73:['snow','Snow'], 75:['snow','Heavy snow'],
    77:['snow','Snow grains'], 80:['rain','Light showers'], 81:['rain','Showers'], 82:['rain','Heavy showers'],
    85:['snow','Snow showers'], 86:['snow','Heavy snow showers'], 95:['storm','Thunderstorm'],
    96:['storm','Thunderstorm with hail'], 99:['storm','Thunderstorm with hail'] };
  function wmo(code, isDay) {
    var w = WMO[code] || ['partly-cloudy', 'Unsettled'];
    var kind = w[0];
    if (isDay === false) kind = kind === 'sunny' ? 'clear-night' : kind === 'partly-cloudy' ? 'cloudy-night' : kind;
    return { kind: kind, phrase: w[1] };
  }
  function uvCategory(v) {
    if (v == null) return '—';
    return v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very high' : 'Extreme';
  }
  function deg(v) { return v == null ? '—' : Math.round(v) + '°'; }
  function stat(k, v) { return '<div class="stat-tile"><div class="k">' + esc(k) + '</div><div class="v mono">' + esc(v) + '</div></div>'; }

  var wx = null, wxAt = 0;

  function renderWeather() {
    if (!wx || !wx.current) return;
    var c = wx.current, d = wx.daily || {};
    var w = wmo(c.weather_code, c.is_day !== 0);
    $('wx-current-slot').innerHTML =
      '<div class="wx-hero">' +
        '<div class="wx-icon">' + ICONS[w.kind] + '</div>' +
        '<div><div class="wx-temp mono">' + esc(deg(c.temperature_2m)) + 'C</div>' +
        '<div class="wx-phrase">' + esc(w.phrase) + ' &middot; Whitley Bay</div>' +
        '<div class="wx-feels">Feels like ' + esc(deg(c.apparent_temperature)) + 'C</div></div>' +
      '</div>';
    var rain = d.precipitation_probability_max && d.precipitation_probability_max[0];
    $('wx-stats').innerHTML =
      stat('Wind', c.wind_speed_10m == null ? '—' : compass8(c.wind_direction_10m) + ' ' + Math.round(c.wind_speed_10m) + ' mph') +
      stat('Humidity', c.relative_humidity_2m == null ? '—' : Math.round(c.relative_humidity_2m) + '%') +
      stat('UV today', uvCategory(d.uv_index_max && d.uv_index_max[0])) +
      stat('Rain today', rain == null ? '—' : Math.round(rain) + '%');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var html = (d.time || []).slice(0, 6).map(function (day, i) {
      var dw = wmo(d.weather_code[i], true);
      var pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
      return '<div class="fday' + (i === 0 ? ' today' : '') + '">' +
        '<div class="dow">' + (i === 0 ? 'Today' : days[new Date(day + 'T12:00:00').getDay()]) + '</div>' +
        ICONS[dw.kind] +
        '<div class="hi mono">' + esc(deg(d.temperature_2m_max[i])) + '</div>' +
        '<div class="lo mono">' + esc(deg(d.temperature_2m_min[i])) + '</div>' +
        '<div class="pop">' + (pop == null ? '&nbsp;' : Math.round(pop) + '%') + '</div>' +
      '</div>';
    }).join('');
    $('wx-forecast-slot').innerHTML = '<div class="forecast-strip">' + html + '</div>';
  }

  function fetchWeather() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + REF.lat + '&longitude=' + REF.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max' +
      '&wind_speed_unit=mph&timezone=Europe%2FLondon&forecast_days=6';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('weather ' + r.status);
      return r.json();
    }).then(function (data) {
      wx = data; wxAt = Date.now();
      renderWeather();
      noteUpdated('weather', wxAt);
      setLive('wx', true, 'live · just now');
      return true;
    }).catch(function () {
      if (!wx) {
        $('wx-current-slot').innerHTML = '<div class="empty-state">Couldn’t reach the weather service. Press Refresh to try again.</div>';
        $('wx-forecast-slot').innerHTML = '';
      }
      setLive('wx', false, wx ? 'couldn’t update · ' + timeAgo(wxAt) : 'unavailable');
      return false;
    });
  }

  // ================= TIDE (Open-Meteo marine forecast, interpolated between hourly points) =================
  var tideSeries = null;

  function compass8(deg) {
    var names = ['N','NE','E','SE','S','SW','W','NW'];
    return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }

  function sampleTide(series, at) {
    if (!series || series.length < 2) return null;
    if (at <= series[0].t) return series[0].v;
    if (at >= series[series.length - 1].t) return series[series.length - 1].v;
    for (var i = 1; i < series.length; i++) {
      if (at <= series[i].t) {
        var a = series[i - 1], b = series[i];
        var f = (at - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * f;
      }
    }
    return null;
  }

  function nextExtrema(series, now) {
    var nextHigh = null, nextLow = null;
    for (var i = 1; i < series.length - 1; i++) {
      var a = series[i - 1].v, b = series[i].v, c = series[i + 1].v;
      var isHigh = b > a && b >= c, isLow = b < a && b <= c;
      if (!isHigh && !isLow) continue;
      var denom = a - 2 * b + c;
      var shift = denom ? 0.5 * (a - c) / denom : 0;          // in hours, between -0.5 and 0.5
      var t = series[i].t + shift * (series[i + 1].t - series[i].t);
      if (t <= now) continue;
      if (isHigh && !nextHigh) nextHigh = { t: t, v: b };
      if (isLow && !nextLow) nextLow = { t: t, v: b };
      if (nextHigh && nextLow) break;
    }
    return { high: nextHigh, low: nextLow };
  }

  function fmtClock(t) {
    var d = new Date(t);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function sparklineSVG(series, now, curVal) {
    var winStart = now - 6 * 3600000, winEnd = now + 18 * 3600000;
    var pts = series.filter(function (p) { return p.t >= winStart && p.t <= winEnd; });
    if (pts.length < 2) pts = series;
    var lo = Math.min.apply(null, pts.map(function (p) { return p.v; }));
    var hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var span = (hi - lo) || 1;
    var W = 600, H = 64, pad = 4;
    function x(t) { return ((t - pts[0].t) / (pts[pts.length - 1].t - pts[0].t)) * W; }
    function y(v) { return H - pad - ((v - lo) / span) * (H - pad * 2); }
    var d = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
    var area = d + ' L ' + x(pts[pts.length - 1].t).toFixed(1) + ' ' + H + ' L ' + x(pts[0].t).toFixed(1) + ' ' + H + ' Z';
    var nowX = Math.max(0, Math.min(W, x(now)));
    var nowY = y(curVal != null ? curVal : sampleTide(pts, now));
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path d="' + area + '" fill="var(--accent-soft)" stroke="none"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      '<line x1="' + nowX.toFixed(1) + '" y1="0" x2="' + nowX.toFixed(1) + '" y2="' + H + '" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 3"/>' +
      '<circle cx="' + nowX.toFixed(1) + '" cy="' + nowY.toFixed(1) + '" r="4" fill="var(--warm)"/>' +
    '</svg>';
  }

  function renderTide() {
    if (!tideSeries || !tideSeries.length) return;
    var now = Date.now();
    var v = sampleTide(tideSeries, now);
    if (v === null) return;
    var ahead = sampleTide(tideSeries, now + 20 * 60000);
    var rising = ahead !== null ? ahead > v : true;
    var ext = nextExtrema(tideSeries, now);
    $('td-body').innerHTML =
      '<div class="tide-hero">' +
        '<div class="tide-metres mono">' + (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + 'm</div>' +
        '<div class="tide-state">' + (rising ? '&#8599; Rising' : '&#8600; Falling') + '</div>' +
      '</div>' +
      '<div class="spark-wrap">' + sparklineSVG(tideSeries, now, v) + '</div>';
    $('td-times').innerHTML =
      stat('Next high', ext.high ? fmtClock(ext.high.t) : '—') +
      stat('Next low', ext.low ? fmtClock(ext.low.t) : '—');
  }

  function tdErrorState(msg) {
    if (!tideSeries) $('td-body').innerHTML = '<div class="empty-state">' + esc(msg) + '</div>';
  }

  // ================= SHIPS (live AIS, streamed from /api/ships) =================
  var CATEGORY_LABEL = { fishing:'Fishing', sailing:'Sailing', pleasure:'Pleasure', tug:'Tug', military:'Military', service:'Service', fast:'Fast craft', passenger:'Passenger', cargo:'Cargo', tanker:'Tanker', unknown:'Unknown', other:'Other' };
  function shipIcon() {
    return svg('<path d="M4 15h16l-1.6 4.2a2 2 0 0 1-1.9 1.3H7.5a2 2 0 0 1-1.9-1.3L4 15z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 15V8h6l3 4.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 8V4.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>');
  }

  function renderShips(snap) {
    if (!snap || !snap.boats) return;
    if (!snap.boats.length) {
      $('sh-list').innerHTML = '<div class="empty-state">' + (esc(snap.error || 'Nothing in range of the bay right now.')) + '</div>';
      return;
    }
    $('sh-list').innerHTML = snap.boats.map(function (b, idx) {
      var portrait = shipIcon() + (b.photo ? '<img src="' + esc(b.photo) + '" alt="" loading="lazy" onerror="this.remove()">' : '');
      return '<div class="ship' + (idx === selectedIdx ? ' selected' : '') + '" data-i="' + idx + '" tabindex="0" role="button" aria-label="Details for ' + esc(b.name) + '">' +
        '<div class="s-icon">' + portrait + '</div>' +
        '<div class="s-main"><div class="s-name">' + esc(b.name) + '</div>' +
          '<div class="s-meta"><span class="cat-pill">' + esc(CATEGORY_LABEL[b.category] || b.category) + '</span>' +
          esc(b.distanceKm + 'km ' + compass8(b.bearing)) +
          (b.destination ? ' &middot; → ' + esc(b.destination) : '') + '</div></div>' +
        '<div class="s-stat"><b class="mono">' + (b.moving ? '<span class="moor-dot"></span>' + b.speedKts + 'kt' : '<span class="moor-dot stopped"></span>stationary') + '</b>' + esc(b.lengthM ? b.lengthM + 'm' : '') + '</div>' +
      '</div>';
    }).join('');
  }

  function shErrorState(msg) {
    $('sh-list').innerHTML = '<div class="empty-state">' + esc(msg) + '</div>';
  }

  function ageLabel(ms) {
    var a = timeAgo(ms);
    return a === 'just now' ? 'as of just now' : 'as of ' + a;
  }

  // Snapshot pills turn amber once the data is more than 3 hours old.
  var STALE_MS = 3 * 3600000;
  function setSnapPill(id, fetchedAt) {
    $(id + '-text').textContent = ageLabel(fetchedAt);
    $(id).classList.toggle('stale', !fetchedAt || Date.now() - fetchedAt > STALE_MS);
  }

  // ================= CHART (bearing/distance plot, from the same db snapshot) =================
  function shortName(name) {
    return name && name.length > 14 ? name.slice(0, 13) + '…' : (name || '');
  }

  // Real coastline from OpenStreetMap natural=coastline (© OpenStreetMap contributors, ODbL),
  // fetched once via the Overpass API and simplified. Stored as flat [east, north] km offsets
  // from Whitley Bay (55.0393, -1.4472) — the same point ship bearings are measured from — so
  // land and ships share one frame. Static geography, never refetched.
  //  - COAST: one continuous line, south (Sunderland side) → north (past Blyth), land to the west.
  //  - ISLES: small closed rings — St Mary's Island, pier heads and rocks.
  //  - TYNE: the river channel upstream of where the coastline data crosses it — drawn by hand
  //    through the known river course, approximate, so ships in the river sit on water.
  var MAP = {"coast":[7.1,-21.58,6.38,-20.01,6.36,-19.29,5.91,-18.34,5.84,-17.82,5.94,-17.62,5.6,-16.72,5.51,-16.14,5.59,-16.08,5.46,-15.6,5.51,-15.41,6.1,-14.82,5.89,-14.87,5.86,-14.79,6.01,-14.7,6.17,-14.76,5.65,-13.97,5.94,-13.67,6.02,-13.29,5.93,-13.68,5.64,-13.89,5.45,-13.39,5.57,-13.33,5.4,-13.35,5.34,-13.19,5.34,-12.89,5.69,-12.87,6.05,-13.04,5.74,-12.87,5.35,-12.87,5.11,-12.25,5.22,-12.1,5.06,-11.6,5.16,-11.0,5.34,-10.44,5.81,-9.84,5.75,-9.51,5.99,-9.04,5.87,-8.88,5.73,-8.04,5.58,-7.94,5.6,-7.78,5.46,-7.66,5.51,-7.55,5.21,-7.3,5.11,-7.34,4.77,-7.12,4.28,-6.6,4.16,-6.33,4.29,-6.06,4.25,-5.93,3.95,-5.87,3.74,-5.57,3.43,-5.64,3.37,-5.35,3.03,-5.26,2.9,-5.04,2.78,-5.07,2.35,-4.52,2.11,-3.78,2.39,-3.46,2.83,-3.26,2.95,-3.1,2.81,-3.26,2.39,-3.44,1.82,-3.99,1.45,-3.68,1.4,-3.49,1.49,-3.44,0.54,-3.83,0.44,-4.09,0.51,-4.3,0.45,-4.66,0.21,-5.08,0.4,-4.98,0.2,-5.13,0.25,-5.29,0.17,-5.17,0.24,-5.32,0.16,-5.19,0.22,-5.31,0.14,-5.25,-0.12,-5.84,-0.98,-6.07,-1.65,-5.86,-1.68,-5.56,-0.62,-5.62,-0.25,-5.33,-0.09,-5.11,-0.01,-4.8,-0.16,-4.74,0.06,-4.57,0.28,-3.59,0.33,-3.63,0.78,-3.31,0.71,-3.44,0.94,-3.36,1.11,-2.88,1.89,-2.78,1.97,-2.67,1.9,-2.52,1.97,-2.5,2.83,-2.74,2.0,-2.48,2.03,-2.3,1.8,-2.3,1.69,-2.18,1.74,-1.8,1.56,-1.81,1.33,-1.52,1.11,-1.0,1.19,-0.69,1.1,-0.58,1.11,-0.66,0.99,-0.65,0.94,-0.55,1.01,-0.42,1.06,-0.49,0.98,-0.37,1.04,-0.26,1.19,-0.15,0.95,-0.08,0.98,0.18,0.32,0.65,-0.3,1.79,-0.5,2.76,-0.31,3.04,-0.27,3.41,-0.47,3.4,-0.68,3.53,-0.74,3.79,-0.92,3.86,-1.04,4.14,-1.06,4.45,-1.4,4.5,-1.51,4.82,-1.46,5.06,-1.73,5.14,-1.82,5.07,-1.96,5.19,-2.86,6.59,-3.23,7.61,-3.26,8.26,-3.16,8.59,-2.99,8.77,-2.8,8.53,-2.69,8.52,-2.8,8.54,-3.0,8.79,-2.89,8.83,-3.08,9.16,-3.01,8.8,-3.09,8.74,-3.15,8.92,-3.11,8.76,-3.22,8.68,-3.28,8.97,-3.16,9.36,-3.39,9.8,-4.07,10.23,-4.5,10.64,-5.09,10.74,-5.13,10.82,-5.73,10.5,-5.99,10.49,-6.1,10.34,-6.09,10.47,-6.38,10.5,-6.69,10.39,-7.53,10.46,-7.29,10.54,-6.83,10.49,-6.47,10.67,-6.28,10.58,-6.16,10.73,-5.54,10.89,-5.75,11.06,-5.9,11.04,-5.8,11.1,-6.02,11.38,-6.3,11.31,-6.56,11.37,-6.54,11.44,-6.7,11.46,-6.79,11.68,-7.25,11.86,-6.84,11.75,-6.68,11.47,-6.57,11.54,-6.33,11.4,-6.13,11.55,-5.98,11.5,-5.46,11.03,-4.9,11.29,-4.64,11.0,-4.84,11.48,-4.76,11.52,-4.7,11.38,-4.6,11.43,-4.48,11.16,-4.57,11.1,-4.36,10.71,-3.87,10.44,-3.66,10.14,-3.3,9.88,-2.52,8.53,-3.28,9.98,-3.79,10.5,-4.4,11.51,-4.71,12.18,-5.03,13.34,-5.25,13.55,-5.93,13.47,-5.94,13.57,-5.47,13.71,-5.19,13.75,-5.11,13.62,-5.23,13.6,-5.19,13.55,-4.97,13.64,-4.73,14.47,-4.26,14.92,-4.29,14.99,-4.21,14.99,-4.3,15.08,-4.31,15.48,-4.11,15.96,-3.89,16.13,-3.52,16.05,-3.3,16.18,-3.59,16.55,-3.69,16.95,-3.57,17.35,-3.48,17.36,-3.62,17.56,-3.94,17.61,-4.1,17.74,-5.03,19.49,-5.22,20.3,-5.17,20.61,-4.99,20.78,-5.93,21.92,-6.21,22.07,-6.63,22.65,-7.09,23.49,-7.58,24.71,-7.97,26.25,-7.89,27.61,-7.76,28.11,-7.25,29.04],"isles":[[-2.45,8.83,-2.38,8.91,-2.45,8.98,-2.37,9.01,-2.41,9.06,-2.41,9.01,-2.51,9.05,-2.59,9.0,-2.55,8.85,-2.45,8.83],[4.29,-6.14,4.27,-6.17,4.31,-6.19,4.29,-6.14],[-0.15,3.54,-0.13,3.63,-0.2,3.66,-0.15,3.54],[-2.67,9.49,-2.67,9.56,-2.75,9.57,-2.67,9.49],[-2.39,9.39,-2.38,9.47,-2.43,9.51,-2.39,9.39],[-3.08,16.89,-3.09,16.84,-3.04,16.87,-3.08,16.89],[-3.17,17.01,-3.18,16.94,-3.15,16.97,-3.17,17.01],[-0.13,3.65,-0.07,3.62,-0.12,3.69,-0.13,3.65],[-3.8,11.19,-3.72,11.23,-3.81,11.34,-3.79,11.37,-3.87,11.4,-3.87,11.29,-3.8,11.19]],"tyne":[-1.68,-5.56,-2.73,-6.06,-4.01,-6.11,-5.28,-5.89,-6.88,-6.89,-8.47,-7.88,-10.38,-7.99,-12.94,-8.55]};

  // Named places — real coordinates via Overpass (© OpenStreetMap contributors),
  // pre-projected to [name, bearing, distanceKm] from the same reference point.
  var LANDMARKS = [["Cullercoats",118.4,0.95],["St Mary's Island",345.7,2.89],["Tynemouth",150.1,2.76],["North Shields",179.9,3.4],["South Shields",168,4.61],["Souter Lighthouse",145.3,9.31],["Seaton Sluice",341.6,5.24],["Blyth",337.8,10.55]];

  function toChartXY(bearing, distanceKm, cx, cy, R, maxD) {
    var r = R * (Math.min(distanceKm, maxD) / maxD);
    var rad = bearing * Math.PI / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }

  // km offsets → chart coordinates (unclamped — the circle clip trims anything off-chart)
  function kmPath(arr, cx, cy, k, close) {
    var d = '';
    for (var i = 0; i < arr.length; i += 2) {
      d += (i === 0 ? 'M' : 'L') + (cx + arr[i] * k).toFixed(1) + ' ' + (cy - arr[i + 1] * k).toFixed(1) + ' ';
    }
    return d + (close ? 'Z' : '');
  }

  // Land polygon: the coastline, then out round the far west (well off-chart) and back.
  function landPath(cx, cy, k) {
    var c = MAP.coast, n = c.length, FAR = 400;
    var pts = c.concat([c[n - 2], FAR, -FAR, FAR, -FAR, -FAR, c[0], -FAR]);
    return kmPath(pts, cx, cy, k, true);
  }

  // Simple label collision: every placed label (and dot) is an [x, y, w, h] box; a new
  // label is only drawn where it overlaps none of them.
  function hits(boxes, r) {
    return boxes.some(function (o) {
      return r[0] < o[0] + o[2] && r[0] + r[2] > o[0] && r[1] < o[1] + o[3] && r[1] + r[3] > o[1];
    });
  }

  // Landmark dots always; names only where there's room (ships get first claim on space).
  function renderLandmarks(cx, cy, R, maxD, boxes) {
    var svg = '';
    LANDMARKS.forEach(function (l) {
      var name = l[0], bearing = l[1], dist = l[2];
      if (dist > maxD * 0.95) return;
      var p = toChartXY(bearing, dist, cx, cy, R, maxD);
      svg += '<circle class="chart-landmark-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.6"/>';
      var w = name.length * 3.4;
      var box = [p[0] - 4 - w, p[1] - 3.5, w, 7];
      if (box[0] < 4 || hits(boxes, box)) return;
      svg += '<text class="chart-landmark-label" x="' + (p[0] - 4).toFixed(1) + '" y="' + (p[1] + 2.4).toFixed(1) + '" text-anchor="end">' + esc(name) + '</text>';
      boxes.push(box);
    });
    return svg;
  }

  function renderMap(snap) {
    if (!snap || !snap.boats) return;
    if (!snap.boats.length) {
      $('mp-chart').innerHTML = '<div class="empty-state">' + (esc(snap.error || 'Nothing in range of the bay right now.')) + '</div>';
      return;
    }
    var W = 240, H = 240, cx = 120, cy = 118, R = 100;
    var maxD = 5;
    snap.boats.forEach(function (b) { if (b.distanceKm > maxD) maxD = b.distanceKm; });
    maxD = Math.ceil(maxD / 5) * 5;
    var k = R / maxD; // chart units per km

    // group boats sharing near-identical bearing + distance so overlapping dots fan out
    var groups = {};
    snap.boats.forEach(function (b) {
      var key = Math.round(b.bearing) + ':' + b.distanceKm.toFixed(1);
      (groups[key] = groups[key] || []).push(b);
    });
    var ships = [];
    Object.keys(groups).forEach(function (key) {
      var arr = groups[key];
      arr.forEach(function (b, i) {
        var spread = arr.length > 1 ? (i - (arr.length - 1) / 2) * 10 : 0;
        var p = toChartXY(b.bearing + spread, b.distanceKm, cx, cy, R, maxD);
        ships.push({ b: b, i: snap.boats.indexOf(b), x: p[0], y: p[1] });
      });
    });

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    svg += '<clipPath id="mp-clip"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '"/></clipPath>';
    svg += '<g clip-path="url(#mp-clip)">';
    svg += '<rect class="chart-sea" x="0" y="0" width="' + W + '" height="' + H + '"/>';
    svg += '<path class="chart-land" d="' + landPath(cx, cy, k) + '"/>';
    MAP.isles.forEach(function (ring) {
      svg += '<path class="chart-land" d="' + kmPath(ring, cx, cy, k, true) + '"/>';
    });
    svg += '<path class="chart-river" style="stroke-width:' + Math.max(1.6, 0.35 * k).toFixed(1) + '" d="' + kmPath(MAP.tyne, cx, cy, k, false) + '"/>';
    svg += '<path class="chart-coastline" d="' + kmPath(MAP.coast, cx, cy, k, false) + '"/>';
    [1 / 3, 2 / 3].forEach(function (f) {
      svg += '<circle class="chart-ring" cx="' + cx + '" cy="' + cy + '" r="' + (R * f).toFixed(1) + '"/>';
    });
    svg += '<!--sea-->';
    svg += '</g>';
    svg += '<circle class="chart-rim" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>';
    [1 / 3, 2 / 3].forEach(function (f) {
      svg += '<text class="chart-ring-label" x="' + (cx + R * f * 0.707 + 2).toFixed(1) + '" y="' + (cy + R * f * 0.707 + 8).toFixed(1) + '">' + Math.round(maxD * f) + 'km</text>';
    });
    svg += '<text class="chart-tick" x="' + cx + '" y="' + (cy - R - 5) + '" text-anchor="middle">N</text>';

    // ship labels first: right of the dot, else left, else leave the dot unlabelled
    var boxes = [[cx - 4, cy - 4, 8, 8], [cx - 58, cy - 5, 52, 10]];
    ships.forEach(function (s) { boxes.push([s.x - 4, s.y - 4, 8, 8]); });
    var shipLabels = '';
    ships.forEach(function (s) {
      var name = shortName(s.b.name), w = name.length * 5.3;
      var right = [s.x + 6, s.y - 4.5, w, 9], left = [s.x - 6 - w, s.y - 4.5, w, 9];
      var tryBox = function (bx) { return bx[0] > 0 && bx[0] + bx[2] < W && !hits(boxes.filter(function (o) { return !(o[0] === s.x - 4 && o[1] === s.y - 4); }), bx); };
      var pick = tryBox(right) ? right : tryBox(left) ? left : null;
      if (!pick) return;
      boxes.push(pick);
      var isRight = pick === right;
      shipLabels += '<text class="chart-label" x="' + (isRight ? s.x + 6 : s.x - 6).toFixed(1) + '" y="' + (s.y + 3).toFixed(1) + '" text-anchor="' + (isRight ? 'start' : 'end') + '">' + esc(name) + '</text>';
    });

    // name the sea only where no ship or ship label sits on top of it
    var seaBox = [cx + R * 0.58 - 26, cy - R * 0.5 - 8, 52, 11];
    svg = svg.replace('<!--sea-->', hits(boxes, seaBox) ? '' :
      '<text class="chart-sea-label" x="' + (cx + R * 0.58).toFixed(1) + '" y="' + (cy - R * 0.5).toFixed(1) + '" text-anchor="middle">North Sea</text>');

    svg += renderLandmarks(cx, cy, R, maxD, boxes);

    svg += '<circle class="chart-center" cx="' + cx + '" cy="' + cy + '" r="3"/>';
    svg += '<text class="chart-center-label" x="' + (cx - 6) + '" y="' + (cy + 3) + '" text-anchor="end">Whitley Bay</text>';

    ships.forEach(function (s) {
      var cls = s.b.moving ? 'chart-dot' : 'chart-dot stopped';
      svg += '<circle class="' + cls + '" cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="4"/>';
    });
    svg += shipLabels;
    ships.forEach(function (s) {
      if (s.i === selectedIdx) svg += '<circle class="chart-sel" cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="7"/>';
    });
    ships.forEach(function (s) {
      svg += '<circle class="chart-hit" data-i="' + s.i + '" cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="9" tabindex="0" role="button" aria-label="Details for ' + esc(s.b.name) + '"><title>' + esc(s.b.name) + '</title></circle>';
    });

    svg += '</svg>';
    $('mp-chart').innerHTML = svg;
  }

  // ================= SHIP DETAIL (hover / tap a dot or list row) =================
  var currentSnap = null, selectedIdx = -1, selectedMmsi = null;

  // Flag state from the MMSI's first three digits (ITU Maritime Identification Digits).
  var MID = { 205:'Belgium', 209:'Cyprus', 210:'Cyprus', 211:'Germany', 212:'Cyprus', 215:'Malta', 218:'Germany',
    219:'Denmark', 220:'Denmark', 224:'Spain', 225:'Spain', 226:'France', 227:'France', 228:'France', 229:'Malta',
    230:'Finland', 231:'Faroe Islands', 232:'United Kingdom', 233:'United Kingdom', 234:'United Kingdom',
    235:'United Kingdom', 236:'Gibraltar', 237:'Greece', 239:'Greece', 240:'Greece', 241:'Greece', 244:'Netherlands',
    245:'Netherlands', 246:'Netherlands', 247:'Italy', 248:'Malta', 249:'Malta', 250:'Ireland', 251:'Iceland',
    255:'Portugal (Madeira)', 256:'Malta', 257:'Norway', 258:'Norway', 259:'Norway', 261:'Poland', 263:'Portugal',
    265:'Sweden', 266:'Sweden', 271:'Turkey', 273:'Russia', 275:'Latvia', 276:'Estonia', 277:'Lithuania',
    304:'Antigua & Barbuda', 305:'Antigua & Barbuda', 308:'Bahamas', 309:'Bahamas', 311:'Bahamas', 314:'Barbados',
    338:'United States', 351:'Panama', 352:'Panama', 353:'Panama', 354:'Panama', 355:'Panama', 356:'Panama',
    357:'Panama', 366:'United States', 367:'United States', 368:'United States', 369:'United States', 370:'Panama',
    371:'Panama', 372:'Panama', 373:'Panama', 374:'Panama', 477:'Hong Kong', 538:'Marshall Islands',
    563:'Singapore', 564:'Singapore', 565:'Singapore', 566:'Singapore', 636:'Liberia', 637:'Liberia' };
  function flagOf(mmsi) {
    var s = String(mmsi || '');
    return /^[2-7]\d{8}$/.test(s) ? (MID[s.slice(0, 3)] || null) : null;
  }

  // AIS destinations are free text typed by the crew — usually a UN/LOCODE like GBNCL.
  var PORTS = { GBNCL:'Newcastle', GBTYN:'River Tyne', GBTYNE:'River Tyne', GBSSH:'South Shields', GBNSH:'North Shields',
    GBSUN:'Sunderland', GBBLY:'Blyth', GBTEE:'Teesport', GBMID:'Middlesbrough', GBHRT:'Hartlepool', GBHUL:'Hull',
    GBIMM:'Immingham', GBGRK:'Grangemouth', GBABD:'Aberdeen', GBLEI:'Leith', GBFXT:'Felixstowe', GBSOU:'Southampton',
    NLRTM:'Rotterdam', NLAMS:'Amsterdam', NLIJM:'IJmuiden', BEANR:'Antwerp', BEZEE:'Zeebrugge', DEHAM:'Hamburg',
    DEBRV:'Bremerhaven', NOBGO:'Bergen', NOSVG:'Stavanger', NOOSL:'Oslo', DKEBJ:'Esbjerg', DKAAR:'Aarhus',
    SEGOT:'Gothenburg', FRLEH:'Le Havre', FRDKK:'Dunkirk', PLGDN:'Gdańsk', ISREY:'Reykjavík' };
  var COUNTRIES = { GB:'UK', NL:'Netherlands', BE:'Belgium', DE:'Germany', NO:'Norway', DK:'Denmark', SE:'Sweden',
    FR:'France', PL:'Poland', IS:'Iceland', IE:'Ireland', ES:'Spain', PT:'Portugal', FI:'Finland', RU:'Russia' };
  function destinationOf(raw) {
    if (!raw) return null;
    var t = String(raw).trim(), key = t.toUpperCase().replace(/[\s>\-_.]/g, '');
    if (PORTS[key]) return { main: PORTS[key], raw: t };
    var m = /^([A-Z]{2})[A-Z]{3}$/.exec(key);
    if (m && COUNTRIES[m[1]]) return { main: t.toUpperCase(), raw: 'a port in ' + COUNTRIES[m[1]] };
    return { main: t, raw: null };
  }

  function statusOf(b) {
    if (b.navStatus) return { main: b.navStatus, sub: null };
    if (b.moving) return { main: 'Under way', sub: b.speedKts + ' kt' };
    return { main: 'Stationary', sub: 'moored or at anchor' };
  }

  function tile(k, v, sub) {
    return '<div class="stat-tile"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>';
  }

  function renderDetail() {
    var el = $('mp-detail');
    if (!el) return;
    var b = currentSnap && currentSnap.boats && currentSnap.boats[selectedIdx];
    if (!b) {
      el.innerHTML = '<div class="sd-hint">Hover or tap a ship — on the chart or in the list — for its details.</div>';
      return;
    }
    var cat = CATEGORY_LABEL[b.category] || b.category || 'Vessel';
    var flag = flagOf(b.mmsi);
    var dest = destinationOf(b.destination);
    var st = statusOf(b);
    var photo = '<div class="sd-photo">' + shipIcon() + (b.photo ? '<img src="' + esc(b.photo) + '" alt="" onerror="this.remove()">' : '') + '</div>';
    var tiles =
      tile('Status', st.main, st.sub) +
      tile('Heading to', dest ? dest.main : 'Not given', dest ? dest.raw : 'no destination on AIS') +
      tile('Position', b.distanceKm + ' km ' + compass8(b.bearing), 'from Whitley Bay') +
      (b.moving
        ? tile('Speed', b.speedKts + ' kt', null) + tile('Course', compass8(b.course) + ' · ' + Math.round(b.course) + '°', null)
        : tile('Speed', (b.speedKts != null ? b.speedKts : 0) + ' kt', null)) +
      tile('Length', b.lengthM ? b.lengthM + ' m' : 'Not given', null) +
      (b.eta ? tile('ETA', b.eta, null) : '') +
      (b.draughtM ? tile('Draught', b.draughtM + ' m', null) : '');
    var link = /^\d{9}$/.test(String(b.mmsi || ''))
      ? '<a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:' + esc(b.mmsi) + '" target="_blank" rel="noopener">Live track on MarineTraffic ↗</a>' : '';
    el.innerHTML =
      '<div class="sd-head">' + photo +
        '<div><div class="sd-name">' + esc(b.name) + '</div>' +
        '<div class="sd-sub"><span class="cat-pill">' + esc(cat) + '</span>' + (flag ? esc(flag) + ' flag' : '') + '</div></div>' +
        '<button class="sd-close" type="button" aria-label="Close details">×</button>' +
      '</div>' +
      '<div class="sd-grid">' + tiles + '</div>' +
      '<div class="sd-foot"><span class="mono">MMSI ' + esc(b.mmsi || '—') + ' · ' + esc(b.heardAt ? 'heard ' + timeAgo(b.heardAt) : '') + '</span>' + link + '</div>' +
      (b.photo && b.photoPage
        ? '<div class="sd-credit">Photo: <a href="' + esc(b.photoPage) + '" target="_blank" rel="noopener">' + esc(b.photoCredit || 'Wikimedia Commons') + '</a></div>'
        : '');
  }

  function select(idx, scroll) {
    if (!currentSnap || !currentSnap.boats[idx]) idx = -1;
    selectedIdx = idx;
    selectedMmsi = idx >= 0 ? currentSnap.boats[idx].mmsi : null;
    renderShips(currentSnap);
    renderMap(currentSnap);
    renderDetail();
    if (scroll && idx >= 0 && window.matchMedia('(max-width: 760px)').matches) {
      $('mp-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setSnapshot(snap) {
    currentSnap = snap;
    selectedIdx = -1;
    if (selectedMmsi && snap.boats) {
      snap.boats.forEach(function (b, i) { if (b.mmsi === selectedMmsi) selectedIdx = i; });
    }
    renderShips(snap);
    renderMap(snap);
    renderDetail();
  }

  function idxFrom(e) {
    var t = e.target.closest ? e.target.closest('[data-i]') : null;
    return t ? parseInt(t.getAttribute('data-i'), 10) : null;
  }
  var hoverTimer = null;
  $('mp-chart').addEventListener('mouseover', function (e) {
    var i = idxFrom(e);
    if (i === null || i === selectedIdx) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { select(i, false); }, 60);
  });
  $('mp-chart').addEventListener('click', function (e) { var i = idxFrom(e); if (i !== null) select(i, false); });
  $('sh-list').addEventListener('click', function (e) { var i = idxFrom(e); if (i !== null) select(i, true); });
  [$('mp-chart'), $('sh-list')].forEach(function (host) {
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var i = idxFrom(e);
      if (i === null) return;
      e.preventDefault();
      select(i, host === $('sh-list'));
    });
  });
  $('mp-detail').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.sd-close')) select(-1, false);
  });

  function mpErrorState(msg) {
    $('mp-chart').innerHTML = '<div class="empty-state">' + esc(msg) + '</div>';
  }

  // ================= LOCAL STORAGE (per device; the page works without it) =================
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode etc. */ } }
  function forget(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  var PASS_KEY = 'north-shore-passcode', SHIPS_KEY = 'north-shore-ships';
  var passcode = null;

  // ================= TIDE FETCH =================
  var tideAt = 0;
  function fetchTide() {
    var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + REF.lat + '&longitude=' + REF.lon +
      '&hourly=sea_level_height_msl&timeformat=unixtime&timezone=GMT&past_days=1&forecast_days=3';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('tide ' + r.status);
      return r.json();
    }).then(function (data) {
      var h = data.hourly || {}, series = [];
      (h.time || []).forEach(function (t, i) {
        var v = h.sea_level_height_msl ? h.sea_level_height_msl[i] : null;
        if (v != null) series.push({ t: t * 1000, v: v });
      });
      if (series.length < 3) throw new Error('tide empty');
      tideSeries = series; tideAt = Date.now();
      renderTide();
      setSnapPill('td-snap', tideAt);
      noteUpdated('tide', tideAt);
      return true;
    }).catch(function () {
      tdErrorState('Couldn’t reach the tide forecast. Press Refresh to try again.');
      if (tideAt) setSnapPill('td-snap', tideAt);
      else $('td-snap-text').textContent = 'unavailable';
      return false;
    });
  }

  // ================= SHIP PHOTOS (Wikimedia Commons, looked up by the page) =================
  // Freely licensed photos only, and only when the match is clear:
  //  1. the ship's IMO number has its own Commons category (unambiguous), or
  //  2. a file is titled with the ship's full name, is filed as a vessel, and either the name
  //     is distinctive (two or more words, or has a number) or the file is tied to this coast.
  // Anything less certain keeps the plain boat icon. Results are remembered on this device.
  var PHOTOS_KEY = 'north-shore-photos';
  var PHOTO_KEEP_MS = 30 * 86400000, PHOTO_RETRY_MS = 7 * 86400000;
  var photos = {}, photoBusy = {};
  var VESSEL_RE = /\b(ships?|vessels?|boats?|tugs?|tugboats?|ferry|ferries|trawlers?|tankers?|lifeboats?|dredgers?|freighters?|imo|mmsi)\b/i;
  var LOCAL_RE = /\b(tyne|tynemouth|shields|blyth|sunderland|newcastle|northumberland|whitley bay|river wear|cullercoats)\b/i;
  var COMMONS = 'https://commons.wikimedia.org/w/api.php?origin=*&format=json&formatversion=2&action=query' +
    '&prop=imageinfo%7Ccategories&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=480' +
    '&iiextmetadatafilter=Artist%7CLicenseShortName%7CCategories%7CImageDescription&cllimit=max&clshow=!hidden';

  function words(s) { return ' ' + String(s || '').toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
  function plainText(html) {
    try { return (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
    catch (e) { return ''; }
  }

  // Turn one Commons page into {url, page, credit}, or null if it isn't a usable picture.
  function photoFromPage(pg) {
    var ii = pg && pg.imageinfo && pg.imageinfo[0];
    if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
    var url = ii.thumburl || ii.url, page = ii.descriptionurl;
    if (!/^https:\/\/upload\.wikimedia\.org\//.test(url || '') || !/^https:\/\/commons\.wikimedia\.org\//.test(page || '')) return null;
    var meta = ii.extmetadata || {};
    var artist = plainText(meta.Artist && meta.Artist.value).slice(0, 60);
    var licence = plainText(meta.LicenseShortName && meta.LicenseShortName.value).slice(0, 30);
    var credit = [artist, licence, 'Wikimedia Commons'].filter(Boolean).join(' · ');
    var landscape = !ii.thumbwidth || !ii.thumbheight || ii.thumbwidth >= ii.thumbheight;
    return { url: url, page: page, credit: credit, landscape: landscape };
  }
  function pageSignals(pg) {
    var ii = (pg.imageinfo && pg.imageinfo[0]) || {}, meta = ii.extmetadata || {};
    var cats = (pg.categories || []).map(function (c) { return c.title; }).join(' | ');
    return [pg.title, cats, meta.Categories && meta.Categories.value, plainText(meta.ImageDescription && meta.ImageDescription.value)].join(' | ');
  }
  function bestOf(pages) {
    var found = pages.map(photoFromPage).filter(Boolean);
    return found.filter(function (f) { return f.landscape; })[0] || found[0] || null;
  }
  function byIndex(pages) { return (pages || []).slice().sort(function (a, b) { return (a.index || 0) - (b.index || 0); }); }

  function searchCommons(ship) {
    var byImo = ship.imo
      ? fetch(COMMONS + '&generator=categorymembers&gcmtype=file&gcmlimit=10&gcmtitle=' + encodeURIComponent('Category:IMO ' + ship.imo))
          .then(function (r) { return r.json(); })
          .then(function (j) { return bestOf(byIndex(j.query && j.query.pages)); })
      : Promise.resolve(null);
    return byImo.then(function (hit) {
      if (hit || !ship.name) return hit;
      var name = words(ship.name);
      if (name.trim().length < 4) return null;
      var distinctive = name.trim().split(' ').length >= 2 || /\d/.test(name);
      return fetch(COMMONS + '&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=' + encodeURIComponent('intitle:"' + name.trim() + '" filetype:bitmap'))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var ok = byIndex(j.query && j.query.pages).filter(function (pg) {
            if (words(String(pg.title || '').replace(/^File:/, '')).indexOf(name) === -1) return false;
            var sig = pageSignals(pg);
            return VESSEL_RE.test(sig) && (distinctive || LOCAL_RE.test(sig));
          });
          return bestOf(ok);
        });
    });
  }

  // Returns the remembered photo (or null) straight away; starts a lookup in the background if needed.
  function photoFor(ship) {
    if (!ship || !ship.mmsi || !ship.name) return null;
    var rec = photos[ship.mmsi], now = Date.now();
    var fresh = rec && (rec.url ? now - rec.at < PHOTO_KEEP_MS : now - rec.at < PHOTO_RETRY_MS && (rec.imo || !ship.imo));
    if (!fresh && !photoBusy[ship.mmsi]) {
      photoBusy[ship.mmsi] = true;
      var asked = { mmsi: ship.mmsi, name: ship.name, imo: ship.imo || null };
      searchCommons(asked).then(function (hit) {
        photos[asked.mmsi] = hit ? { url: hit.url, page: hit.page, credit: hit.credit, at: Date.now(), imo: asked.imo }
                                 : { at: Date.now(), imo: asked.imo };
        save(PHOTOS_KEY, photos);
        delete photoBusy[asked.mmsi];
        if (hit) queueShipRender();
      }).catch(function () {
        setTimeout(function () { delete photoBusy[asked.mmsi]; }, 5 * 60000);   // offline or blocked: try again later
      });
    }
    return rec && rec.url ? rec : null;
  }

  // ================= SHIP FEED =================
  // /api/ships listens to the AIS feed for ~50 s per request and streams one JSON line per
  // message. Each line is a partial record (position reports and static details arrive
  // separately), merged here by MMSI. Ships are kept on this device between visits so the
  // chart isn't empty while the feed catches up.
  var ships = {};                       // mmsi -> merged record
  var KEEP_MOVING_MS = 10 * 60000;      // a moving ship reports every few seconds; gone after 10 min of silence
  var KEEP_STOPPED_MS = 30 * 60000;     // moored / anchored ships report every 3 minutes
  var BURST_MS = 5 * 60000;             // listen continuously this long after opening / refreshing
  var IDLE_GAP_MS = 130000;             // then one ~50 s listen roughly every 3 minutes
  var listenUntil = 0, listening = false, listenCtl = null, idleTimer = null, feedError = null;
  var listenStartedAt = 0, lastHeardAt = 0, feedFailures = 0;

  function isMoving(s) { return s.speedKts != null && s.speedKts > 0.5; }

  function pruneShips() {
    var now = Date.now();
    Object.keys(ships).forEach(function (m) {
      var s = ships[m];
      var keep = isMoving(s) ? KEEP_MOVING_MS : KEEP_STOPPED_MS;
      if (!s.heardAt || now - s.heardAt > keep) delete ships[m];
    });
  }

  function shipsSnapshot() {
    pruneShips();
    var boats = Object.keys(ships).map(function (m) { return ships[m]; })
      .filter(function (s) { return s.distanceKm != null && s.bearing != null; })
      .map(function (s) {
        return {
          mmsi: s.mmsi, name: s.name || ('MMSI ' + s.mmsi), category: s.category || 'unknown',
          distanceKm: s.distanceKm, bearing: s.bearing, speedKts: s.speedKts != null ? s.speedKts : 0,
          course: s.course != null ? s.course : 0, moving: isMoving(s), navStatus: s.navStatus || null,
          destination: s.destination || null, lengthM: s.lengthM || null, eta: s.eta || null,
          draughtM: s.draughtM || null, heardAt: s.heardAt,
          photo: (photoFor(s) || {}).url || null, photoPage: (photoFor(s) || {}).page || null, photoCredit: (photoFor(s) || {}).credit || null
        };
      })
      .sort(function (a, b) { return a.distanceKm - b.distanceKm; });
    var error = null;
    if (!boats.length) {
      error = feedError ? feedError
        : (listening && Date.now() - listenStartedAt < 4 * 60000)
          ? 'Listening for ships… moving ones appear within seconds, moored ones can take up to three minutes.'
          : 'Nothing in range of the bay right now.';
    }
    return { boats: boats, error: error };
  }

  var renderQueued = false;
  function queueShipRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function () {
      renderQueued = false;
      setSnapshot(shipsSnapshot());
      updateShipPills();
      save(SHIPS_KEY, ships);
    }, 400);
  }

  function updateShipPills() {
    var text, cls;
    if (feedError) { text = 'feed problem'; cls = 'stale'; }
    else if (listening) { text = lastHeardAt ? 'live · heard ' + timeAgo(lastHeardAt) : 'listening…'; cls = 'live'; }
    else if (lastHeardAt) { text = 'as of ' + timeAgo(lastHeardAt); cls = Date.now() - lastHeardAt > 15 * 60000 ? 'stale' : ''; }
    else { text = 'waiting…'; cls = ''; }
    ['sh-snap', 'mp-snap'].forEach(function (id) {
      $(id + '-text').textContent = text;
      $(id).className = 'snap-pill' + (cls ? ' ' + cls : '');
    });
  }

  function applyFeedLine(line) {
    if (!line) return;
    var msg;
    try { msg = JSON.parse(line); } catch (e) { return; }
    if (msg.type === 'ship' && msg.ship && msg.ship.mmsi) {
      var cur = ships[msg.ship.mmsi] || {};
      Object.keys(msg.ship).forEach(function (k) { if (msg.ship[k] != null) cur[k] = msg.ship[k]; });
      ships[msg.ship.mmsi] = cur;
      if (msg.ship.heardAt) lastHeardAt = Date.now();
      feedError = null;
      queueShipRender();
    } else if (msg.type === 'error') {
      feedError = msg.message || 'The ship feed reported a problem.';
      queueShipRender();
    }
  }

  function readFeed(res) {
    if (!res.body || !res.body.getReader) {
      return res.text().then(function (t) { t.split('\n').forEach(applyFeedLine); });
    }
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { applyFeedLine(buf.trim()); return; }
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        lines.forEach(applyFeedLine);
        return pump();
      });
    }
    return pump();
  }

  function stopListening() {
    clearTimeout(idleTimer); idleTimer = null;
    if (listenCtl) { try { listenCtl.abort(); } catch (e) { /* ignore */ } }
    listenCtl = null; listening = false;
  }

  function scheduleNext() {
    listening = false;
    updateShipPills();
    if (document.hidden || !passcode) return;
    if (feedError && feedFailures >= 3) return;             // stop hammering a broken feed; Refresh retries
    if (Date.now() < listenUntil) return listenOnce();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(listenOnce, IDLE_GAP_MS);
  }

  function listenOnce() {
    if (listening || document.hidden || !passcode) return;
    clearTimeout(idleTimer); idleTimer = null;
    listening = true;
    if (!listenStartedAt) listenStartedAt = Date.now();
    listenCtl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    updateShipPills();
    fetch('/api/ships', { headers: { 'x-passcode': passcode }, signal: listenCtl ? listenCtl.signal : undefined, cache: 'no-store' })
      .then(function (res) {
        if (res.status === 401) { showGate('That passcode no longer works. Enter the new one.'); throw { stop: true }; }
        if (res.status === 503) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            feedError = 'Ships aren’t switched on yet: ' + (j.message || 'the server isn’t fully set up.');
            feedFailures = 3;
            queueShipRender();
          });
        }
        if (!res.ok) throw new Error('feed ' + res.status);
        feedFailures = 0;
        return readFeed(res);
      })
      .then(function () { if (feedError) feedFailures += 1; scheduleNext(); })
      .catch(function (err) {
        listening = false;
        if (err && (err.stop || err.name === 'AbortError')) { updateShipPills(); return; }
        feedFailures += 1;
        feedError = Object.keys(ships).length ? null : 'Couldn’t reach the ship feed. It will try again shortly.';
        queueShipRender();
        if (feedFailures < 3 && !document.hidden) { clearTimeout(idleTimer); idleTimer = setTimeout(listenOnce, 15000); }
      });
  }

  function startListening() {
    listenUntil = Date.now() + BURST_MS;
    listenStartedAt = Date.now();
    feedFailures = 0; feedError = null;
    if (!listening) listenOnce();
  }

  // ================= REFRESH =================
  function refreshAll(manual) {
    var btn = $('refresh-btn');
    if (manual) {
      btn.disabled = true;
      btn.classList.add('spinning');
      $('refresh-label').textContent = 'Refreshing…';
    }
    startListening();
    return Promise.all([fetchWeather(), fetchTide()]).then(function (r) {
      if (!manual) return;
      btn.disabled = false;
      btn.classList.remove('spinning');
      $('refresh-label').textContent = 'Refresh';
      var parts = [];
      parts.push(r[0] && r[1] ? 'Weather and tide updated just now'
        : r[0] ? 'Weather updated; tide couldn’t update'
        : r[1] ? 'Tide updated; weather couldn’t update'
        : 'Weather and tide couldn’t update');
      parts.push('listening for ships');
      $('refresh-note').textContent = parts.join(' · ');
    });
  }
  $('refresh-btn').addEventListener('click', function () { refreshAll(true); });

  // keep things fresh while the page stays open, and pause the ship feed while it's hidden
  setInterval(function () {
    if (!passcode || document.hidden) return;
    if (Date.now() - wxAt > 15 * 60000) fetchWeather();
    if (Date.now() - tideAt > 60 * 60000) fetchTide();
  }, 60000);
  setInterval(function () {
    if (tideSeries) renderTide();
    if (tideAt) setSnapPill('td-snap', tideAt);
    if (wxAt && wx) setLive('wx', true, 'live · ' + timeAgo(wxAt));
    if (passcode) { updateShipPills(); if (!listening) setSnapshot(shipsSnapshot()); }
  }, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!passcode) return;
    if (document.hidden) { stopListening(); updateShipPills(); return; }
    startListening();
    if (Date.now() - wxAt > 10 * 60000) fetchWeather();
    if (Date.now() - tideAt > 30 * 60000) fetchTide();
  });

  // ================= PASSCODE GATE =================
  function showGate(message) {
    stopListening();
    passcode = null;
    forget(PASS_KEY);
    $('app').hidden = true;
    $('gate').hidden = false;
    $('gate-error').textContent = message || '';
    $('gate-btn').disabled = false;
    $('gate-btn').textContent = 'Open';
    try { $('gate-input').focus(); } catch (e) { /* ignore */ }
  }

  function openApp(code) {
    passcode = code;
    save(PASS_KEY, code);
    $('gate').hidden = true;
    $('app').hidden = false;
    var seen = load(PHOTOS_KEY);
    if (seen && typeof seen === 'object') photos = seen;
    var cached = load(SHIPS_KEY);
    if (cached && typeof cached === 'object') ships = cached;
    Object.keys(ships).forEach(function (m) { if (ships[m].heardAt > lastHeardAt) lastHeardAt = ships[m].heardAt; });
    setSnapshot(shipsSnapshot());
    updateShipPills();
    refreshAll(false);
  }

  // Returns 'ok', 'wrong', 'unset' (server has no passcode configured yet) or 'offline'.
  function checkPasscode(code) {
    return fetch('/api/ships?check=1', { headers: { 'x-passcode': code }, cache: 'no-store' })
      .then(function (res) { return res.status === 200 ? 'ok' : res.status === 401 ? 'wrong' : res.status === 503 ? 'unset' : 'offline'; })
      .catch(function () { return 'offline'; });
  }

  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('gate-input').value;
    if (!code) return;
    $('gate-btn').disabled = true;
    $('gate-btn').textContent = 'Checking…';
    $('gate-error').textContent = '';
    checkPasscode(code).then(function (result) {
      if (result === 'ok') { $('gate-input').value = ''; return openApp(code); }
      $('gate-btn').disabled = false;
      $('gate-btn').textContent = 'Open';
      $('gate-error').textContent =
        result === 'wrong' ? 'That passcode isn’t right. Try again.'
        : result === 'unset' ? 'The site isn’t set up yet: add SITE_PASSCODE in Vercel, then redeploy.'
        : 'Couldn’t reach the server. Check your connection and try again.';
    });
  });

  $('lock-btn').addEventListener('click', function () { forget(SHIPS_KEY); ships = {}; showGate(''); });

  var saved = load(PASS_KEY);
  if (typeof saved === 'string' && saved) {
    checkPasscode(saved).then(function (result) {
      if (result === 'ok' || result === 'offline') openApp(saved);   // offline: still show cached view
      else showGate(result === 'unset' ? 'The site isn’t set up yet: add SITE_PASSCODE in Vercel, then redeploy.' : '');
    });
  } else {
    showGate('');
  }
})();
