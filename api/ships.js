// North Shore — live ships near Whitley Bay.
//
// Listens to the aisstream.io AIS feed for a short window and streams what it hears back to
// the page as newline-delimited JSON. The feed key never leaves this function: it is read
// from the AISSTREAM_API_KEY environment variable (set in Vercel → Settings → Environment
// Variables), and callers must send the site passcode (SITE_PASSCODE) to get anything back.
//
// Environment variables:
//   AISSTREAM_API_KEY  (required)  your aisstream.io key — keep it secret
//   SITE_PASSCODE      (required)  the passcode the page asks for
//   RANGE_KM           (optional)  how far out to look, default 25

const crypto = require('crypto');
// Uses Node's built-in WebSocket (Node 22+), so the project has no dependencies to install.

const REF = { lat: 55.0393, lon: -1.4472 };          // Whitley Bay — same point the chart is drawn from
const FEED_URL = process.env.AISSTREAM_URL || 'wss://stream.aisstream.io/v0/stream';
const MAX_LISTEN_MS = 50000;                         // stay under the 60 s function limit
const WRONG_PASSCODE_DELAY_MS = 600;                 // slows down guessing

const NAV_STATUS = {
  0: 'Under way', 1: 'At anchor', 2: 'Not under command', 3: 'Restricted manoeuvrability',
  4: 'Constrained by draught', 5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Under sail',
};

function categoryOf(type) {
  const t = Number(type);
  if (!t) return 'unknown';
  if (t === 30) return 'fishing';
  if (t === 31 || t === 32 || t === 52) return 'tug';
  if (t === 35) return 'military';
  if (t === 36) return 'sailing';
  if (t === 37) return 'pleasure';
  if (t >= 40 && t <= 49) return 'fast';
  if (t === 33 || t === 34 || (t >= 50 && t <= 59)) return 'service';
  if (t >= 60 && t <= 69) return 'passenger';
  if (t >= 70 && t <= 79) return 'cargo';
  if (t >= 80 && t <= 89) return 'tanker';
  return 'other';
}

const rad = (d) => (d * Math.PI) / 180;
function distanceKm(lat, lon) {
  const dLat = rad(lat - REF.lat), dLon = rad(lon - REF.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(REF.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function bearingDeg(lat, lon) {
  const y = Math.sin(rad(lon - REF.lon)) * Math.cos(rad(lat));
  const x = Math.cos(rad(REF.lat)) * Math.sin(rad(lat)) - Math.sin(rad(REF.lat)) * Math.cos(rad(lat)) * Math.cos(rad(lon - REF.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const clean = (s) => (typeof s === 'string' ? s.replace(/@+/g, ' ').replace(/\s+/g, ' ').trim() : '');
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

function passcodeOk(given) {
  const want = process.env.SITE_PASSCODE || '';
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return want.length > 0 && crypto.timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Turn one feed message into a partial ship record ({mmsi, ...only the fields this message knows}).
function patchFrom(msg, rangeKm) {
  const meta = msg.MetaData || {};
  const body = (msg.Message && msg.Message[msg.MessageType]) || {};
  const mmsi = String(meta.MMSI || body.UserID || '');
  if (!/^\d{9}$/.test(mmsi)) return null;

  const patch = { mmsi };
  const name = clean(meta.ShipName) || clean(body.Name) || clean(body.ReportA && body.ReportA.Name);
  if (name) patch.name = name;

  const type = msg.MessageType;
  const isPosition = type === 'PositionReport' || type === 'StandardClassBPositionReport' || type === 'ExtendedClassBPositionReport';

  if (isPosition) {
    const lat = Number(body.Latitude != null ? body.Latitude : meta.latitude);
    const lon = Number(body.Longitude != null ? body.Longitude : meta.longitude);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const dist = distanceKm(lat, lon);
    if (dist > rangeKm) return null;
    patch.lat = round(lat, 5);
    patch.lon = round(lon, 5);
    patch.distanceKm = round(dist, 1);
    patch.bearing = Math.round(bearingDeg(lat, lon));
    const sog = Number(body.Sog);
    if (isFinite(sog) && sog < 102.3) patch.speedKts = round(sog, 1);
    const cog = Number(body.Cog);
    if (isFinite(cog) && cog < 360) patch.course = Math.round(cog);
    if (type === 'PositionReport' && NAV_STATUS[body.NavigationalStatus]) patch.navStatus = NAV_STATUS[body.NavigationalStatus];
    patch.heardAt = Date.now();
  }

  // Static details: class A (ShipStaticData), class B (StaticDataReport part B, ExtendedClassB).
  const stat = type === 'ShipStaticData' ? body
    : type === 'ExtendedClassBPositionReport' ? body
    : type === 'StaticDataReport' ? (body.ReportB || {})
    : null;
  if (stat) {
    const shipType = stat.Type != null ? stat.Type : stat.ShipType;
    if (shipType) patch.category = categoryOf(shipType);
    const dim = stat.Dimension;
    if (dim && Number(dim.A) + Number(dim.B) > 0) patch.lengthM = Number(dim.A) + Number(dim.B);
    const dest = clean(stat.Destination);
    if (dest) patch.destination = dest;
    const eta = stat.Eta;
    if (eta && eta.Month >= 1 && eta.Month <= 12 && eta.Day >= 1 && eta.Day <= 31) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const hhmm = eta.Hour < 24 && eta.Minute < 60
        ? ' ' + String(eta.Hour).padStart(2, '0') + ':' + String(eta.Minute).padStart(2, '0') + ' UTC' : '';
      patch.eta = eta.Day + ' ' + months[eta.Month - 1] + hhmm;
    }
    const draught = Number(stat.MaximumStaticDraught);
    if (draught > 0) patch.draughtM = round(draught, 1);
    const imo = Number(stat.ImoNumber);
    if (imo >= 1000000 && imo <= 9999999) patch.imo = imo;   // used to find the right photo
  }

  return Object.keys(patch).length > 1 ? patch : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });

  if (!process.env.SITE_PASSCODE) {
    return json(res, 503, { error: 'not_configured', message: 'SITE_PASSCODE is not set in Vercel yet.' });
  }
  if (!passcodeOk(req.headers['x-passcode'])) {
    await new Promise((r) => setTimeout(r, WRONG_PASSCODE_DELAY_MS));
    return json(res, 401, { error: 'wrong_passcode' });
  }
  const key = process.env.AISSTREAM_API_KEY;
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('check')) {
    return json(res, 200, { ok: true, shipFeedReady: Boolean(key) });
  }
  if (!key) {
    return json(res, 503, { error: 'not_configured', message: 'AISSTREAM_API_KEY is not set in Vercel yet.' });
  }

  const rangeKm = Math.min(Math.max(Number(process.env.RANGE_KM) || 25, 5), 60);
  const listenMs = Math.min(Math.max(Number(url.searchParams.get('listen')) * 1000 || MAX_LISTEN_MS, 5000), MAX_LISTEN_MS);
  const dLat = rangeKm / 110.574;
  const dLon = rangeKm / (111.32 * Math.cos(rad(REF.lat)));

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };
  send({ type: 'hello', rangeKm, listenMs, at: Date.now() });

  await new Promise((resolve) => {
    let finished = false, messages = 0, ws;
    const finish = (extra) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { if (ws) ws.close(); } catch (e) { /* already closed */ }
      send(Object.assign({ type: 'end', messages, at: Date.now() }, extra || {}));
      res.end();
      resolve();
    };
    const timer = setTimeout(() => finish(), listenMs);
    req.on('close', () => finish());

    try {
      ws = new WebSocket(FEED_URL);
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      send({ type: 'error', message: 'Could not reach the ship feed.' });
      return finish();
    }

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        APIKey: key,
        BoundingBoxes: [[[REF.lat - dLat, REF.lon - dLon], [REF.lat + dLat, REF.lon + dLon]]],
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData', 'StaticDataReport'],
      }));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        const text = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
        msg = JSON.parse(text);
      } catch (e) { return; }
      if (msg && msg.error) {
        // e.g. an invalid key. Pass the feed's wording on, never the key itself.
        send({ type: 'error', message: 'Ship feed refused the connection: ' + String(msg.error).slice(0, 120) });
        return finish();
      }
      messages += 1;
      const patch = patchFrom(msg, rangeKm);
      if (patch) send({ type: 'ship', ship: patch });
    });

    ws.addEventListener('error', () => {
      send({ type: 'error', message: 'Lost the connection to the ship feed.' });
      finish();
    });
    ws.addEventListener('close', () => finish());
  });
};

module.exports.patchFrom = patchFrom;   // exported for tests
