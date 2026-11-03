const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  TRAVEL_DIR,
  refreshPhotos
} = require('./photos-lib');
const { publish } = require('./publish');

const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const cleaned = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, cleaned));
  if (!full.startsWith(root)) return null;
  return full;
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': ext === '.json' ? 'no-store' : 'public, max-age=0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let photoCache = null;
let watchTimer = null;
let publishTimer = null;
let scanning = false;
let publishing = false;

function getPhotos(reason, force) {
  if (!force && photoCache) return photoCache;
  if (scanning && photoCache) return photoCache;
  scanning = true;
  try {
    photoCache = refreshPhotos(reason || 'scan');
    return photoCache;
  } finally {
    scanning = false;
  }
}

function schedulePublish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(async () => {
    if (publishing) return;
    publishing = true;
    try {
      console.log('[publish] 写真変更を検知 → GitHub へ自動公開');
      const result = publish();
      console.log('[publish]', result.message);
    } catch (e) {
      console.error('[publish] 自動公開失敗:', e && e.message ? e.message : e);
    } finally {
      publishing = false;
    }
  }, 15000);
}

function watchTravel() {
  if (!fs.existsSync(TRAVEL_DIR)) return;
  try {
    fs.watch(TRAVEL_DIR, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        try {
          getPhotos('watch', true);
          schedulePublish();
        } catch (e) {
          console.error('[photos] watch refresh failed:', e);
        }
      }, 800);
    });
    console.log('[photos] watching', TRAVEL_DIR);
    console.log('[publish] 写真追加後 15秒で自動 push します');
  } catch (e) {
    console.warn('[photos] watch unavailable:', e.message);
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/travel-photos') {
    try {
      sendJson(res, 200, getPhotos('api', false));
    } catch (e) {
      sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
    }
    return;
  }

  if (urlPath === '/api/publish' && req.method === 'POST') {
    if (publishing) {
      sendJson(res, 409, { ok: false, message: '公開処理中です' });
      return;
    }
    publishing = true;
    try {
      await readBody(req);
      const result = publish();
      photoCache = null;
      getPhotos('after-publish', true);
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 500, { ok: false, message: String(e && e.message ? e.message : e) });
    } finally {
      publishing = false;
    }
    return;
  }

  let reqPath = urlPath;
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = safeJoin(ROOT, reqPath);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(req, res, filePath);
});

getPhotos('startup', true);
watchTravel();
setInterval(() => {
  try {
    getPhotos('interval', true);
  } catch (e) {
    console.error('[photos] interval refresh failed:', e);
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}/`);
  console.log(`travel: http://localhost:${PORT}/travel.html`);
  console.log('publish: publish.bat または画面の「GitHubに公開」');
});
