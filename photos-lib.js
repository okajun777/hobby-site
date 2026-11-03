const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TRAVEL_DIR = path.join(ROOT, 'images', 'travel');
const PHOTOS_JSON = path.join(ROOT, 'photos.json');
const REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'];
const IMG_RE = /\.(jpe?g|png|gif|webp)$/i;

function formatEndDay(startDay, rangeToken) {
  // フォルダ例: 20181214-5 → 14-15 / 20250111-2 → 11-12 / 20210813-15 → 13-15
  if (!rangeToken) return '';
  const raw = String(rangeToken).replace(/^[ｰ\-]/, '');
  if (!/^\d+$/.test(raw)) return '-' + raw;
  let endDay = parseInt(raw, 10);
  if (raw.length === 1) {
    endDay = Math.floor(startDay / 10) * 10 + endDay;
    if (endDay < startDay) endDay += 10;
  }
  return '-' + endDay;
}

function formatLabel(folderName) {
  const m = folderName.match(/^(\d{4})(\d{2})(\d{2})([ｰ\-]\d+)?\s*(.*)$/);
  if (!m) return folderName;
  const startDay = parseInt(m[3], 10);
  const range = formatEndDay(startDay, m[4] || '');
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

function summarize(data) {
  const albums = Object.values(data).reduce((n, a) => n + a.length, 0);
  const files = Object.values(data).reduce(
    (n, a) => n + a.reduce((m, x) => m + x.files.length, 0),
    0
  );
  return { albums, files };
}

function writePhotosJson(data) {
  fs.writeFileSync(PHOTOS_JSON, JSON.stringify(data, null, 2), 'utf8');
}

function refreshPhotos(reason) {
  const data = scanTravelPhotos();
  writePhotosJson(data);
  const { albums, files } = summarize(data);
  console.log(`[photos] ${reason}: albums=${albums}, files=${files}`);
  return data;
}

module.exports = {
  ROOT,
  TRAVEL_DIR,
  PHOTOS_JSON,
  REGIONS,
  scanTravelPhotos,
  writePhotosJson,
  refreshPhotos,
  summarize
};
