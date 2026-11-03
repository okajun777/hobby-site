const { execFileSync } = require('child_process');
const { ROOT, refreshPhotos, summarize } = require('./photos-lib');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe'
  });
}

function publish() {
  const data = refreshPhotos('publish');
  const { albums, files } = summarize(data);

  run('git', [
    'add',
    '--',
    'photos.json',
    'images/travel',
    'travel.html',
    'server.js',
    'photos-lib.js',
    'publish.js',
    'publish.bat',
    'start-site.bat',
    '.gitignore'
  ]);

  const status = run('git', ['status', '--porcelain']);
  const hasStaged = status.split(/\r?\n/).some((line) => /^[MADRCU]/.test(line));
  if (!hasStaged) {
    console.log('[publish] 公開する変更はありません。');
    console.log(`[publish] 現在: albums=${albums}, files=${files}`);
    return { ok: true, pushed: false, albums, files, message: '変更なし' };
  }

  const msg = `Update travel photos (${albums} albums, ${files} files).`;
  try {
    run('git', ['commit', '-m', msg], { stdio: 'inherit' });
  } catch (e) {
    const again = run('git', ['status', '--porcelain']).trim();
    if (!again) {
      return { ok: true, pushed: false, albums, files, message: '変更なし' };
    }
    throw e;
  }

  run('git', ['push', 'origin', 'HEAD'], { stdio: 'inherit' });
  console.log('[publish] GitHub Pages へ push しました。');
  console.log('https://okajun777.github.io/hobby-site/travel.html');
  return { ok: true, pushed: true, albums, files, message: 'push完了' };
}

if (require.main === module) {
  try {
    publish();
  } catch (e) {
    console.error('[publish] 失敗:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

module.exports = { publish };
