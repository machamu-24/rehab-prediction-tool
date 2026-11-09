import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const port = Number(process.env.PORT || 3020);
if (!Number.isInteger(port) || port < 1024 || port > 65515) throw new Error('PORTは1024〜65515で設定してください');
const url = `http://localhost:${port}/`;
const openBrowser = address => {
  if (process.env.REHAB_NO_OPEN === '1') return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const opener = spawn(command, [address], { stdio: 'ignore' });
  opener.on('error', () => console.log(`ブラウザで ${address} を開いてください`));
};
try {
  const response = await fetch(`${url}api/local/health`, { signal: AbortSignal.timeout(1200) });
  if ((await response.json()).app === 'rehab-prediction-tool') {
    console.log(`通常版は起動済みです: ${url}（終了は既存の起動用ターミナルでControl + C）`);
    openBrowser(url); process.exit(0);
  }
} catch { /* Not running yet. */ }
if (!fs.existsSync('.env')) throw new Error('.envがありません。docs/LOCAL_USER_GUIDE.mdの初期設定を確認してください');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
console.log('通常版をビルドしています…');
const build = spawnSync(pnpm, ['build'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DEMO_MODE: 'false' } });
if (build.error || build.status !== 0) throw new Error('ビルドできませんでした。Node.jsとpnpm、および上のエラーを確認してください');
const child = spawn(process.execPath, [path.join(root, 'dist/index.js')], {
  cwd: root, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) }, stdio: ['inherit', 'pipe', 'inherit'],
});
let opened = false, log = '';
child.stdout.on('data', chunk => {
  process.stdout.write(chunk); log = (log + chunk.toString()).slice(-4000);
  const match = log.match(/Server running on (http:\/\/localhost:\d+\/)/);
  if (match && !opened) { opened = true; console.log('終了: このターミナルでControl + C'); openBrowser(match[1]); }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
