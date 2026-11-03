const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const TRAVEL_DIR = path.join(ROOT, 'images', 'travel');
const PHOTOS_JSON = path.join(ROOT, 'photos.json');
const REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'];
const IMG_RE = /\.(jpe?g|png|gif|webp)$/i;

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

function formatLabel(folderName) {
  const m = folderName.match(/^(\d{4})(\d{2})(\d{2})([ｰ\-]\d+)?\s*(.*)$/);
  if (!m) return folderName;
  const range = (m[4] || '').replace('ｰ', '-');
  const place = (m[5] || '').trim();
  const date = `${m[1]}/${m[2]}/${m[3]}${range}`;
  return place ? `${date} ${place}` : date;
}

function badgeFromFolder(folderName) {
  const place = folderName.replace(/^\d{4}\d{2}\d{2}([ｰ\-]\d+)?\s*/, '').trim();
  if (!place) return folderName;
  const parts = place.split(/\s+/);
  return parts[parts.length - 1];
}

function scanTravelPhotos() {
  const data = {};
  for (const region of REGIONS) {
    const regionDir = path.join(TRAVEL_DIR, region);
    data[region] = [];
    if (!fs.existsSync(regionDir)) continue;

    const albumNames = fs.readdirSync(regionDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'ja'));

    for (const name of albumNames) {
      const albumDir = path.join(regionDir, name);
      let files = [];
      try {
        files = fs.readdirSync(albumDir)
          .filter((f) => {
            if (!IMG_RE.test(f)) return false;
            try {
              return fs.statSync(path.join(albumDir, f)).isFile();
            } catch {
              return false;
            }
          })
          .sort((a, b) => a.localeCompare(b, 'ja'));
      } catch {
        continue;
      }
      if (!files.length) continue;

      data[region].push({
        label: formatLabel(name),
        path: `images/travel/${region}/${name}/`,
        badge: badgeFromFolder(name),
        files
      });
    }
  }
  return data;
}

function writePhotosJson(data) {
  fs.writeFileSync(PHOTOS_JSON, JSON.stringify(data, null, 2), 'utf8');
}

function refreshPhotos(reason) {
  const data = scanTravelPhotos();
  writePhotosJson(data);
  const albums = Object.values(data).reduce((n, a) => n + a.length, 0);
  const files = Object.values(data).reduce((n, a) => n + a.reduce((m, x) => m + x.files.length, 0), 0);
  console.log(`[photos] ${reason}: albums=${albums}, files=${files}`);
  return data;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
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

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/travel-photos') {
    try {
      sendJson(res, 200, getPhotos('api', false));
    } catch (e) {
      sendJson(res, 500, { error: String(e && e.message ? e.message : e) });
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

let photoCache = null;
let watchTimer = null;
let scanning = false;

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

function watchTravel() {
  if (!fs.existsSync(TRAVEL_DIR)) return;
  try {
    fs.watch(TRAVEL_DIR, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        try {
          getPhotos('watch', true);
        } catch (e) {
          console.error('[photos] watch refresh failed:', e);
        }
      }, 800);
    });
    console.log('[photos] watching', TRAVEL_DIR);
  } catch (e) {
    console.warn('[photos] watch unavailable:', e.message);
  }
}

// 起動時に一覧を作っておく（表示は photos.json を優先して即時）
getPhotos('startup', true);
watchTravel();
// 念のため定期再スキャン（ネットワークドライブの watch 漏れ対策）
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
});
