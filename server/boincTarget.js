import fs from 'node:fs';
import path from 'node:path';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export function isLocalBoincHost(host) {
  if (!host) return true;
  const h = String(host).trim().toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith('.localhost');
}

/** Shared volume path for the host-network proxy's upstream target. */
export function targetFilePath(socketPath) {
  if (!socketPath) return null;
  return path.join(path.dirname(socketPath), 'target.json');
}

export function readProxyTarget(filePath, fallback = { host: '127.0.0.1', port: 31416 }) {
  if (!filePath) return { ...fallback };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const host = String(raw.host || fallback.host).trim() || fallback.host;
    const port = Number(raw.port) || fallback.port;
    return { host, port };
  } catch {
    return { ...fallback };
  }
}

export function writeProxyTarget(filePath, { host, port }) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    host: String(host || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(port) || 31416,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}
