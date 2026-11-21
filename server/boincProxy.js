/**
 * Unix-socket TCP proxy to BOINC GUI RPC.
 *
 * Host-network sidecar listens on a shared-volume socket; the bridge web
 * container connects via that socket (UFW cannot block unix sockets).
 *
 * Upstream host:port is read from /boinc-ipc/target.json on each connect so
 * the settings form can switch between local BOINC and remote LAN clients
 * without rebuilding the proxy. Defaults to BOINC_HOST/BOINC_PORT.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { readProxyTarget, targetFilePath } from './boincTarget.js';

const socketPath = process.env.BOINC_SOCKET || '/boinc-ipc/gui_rpc.sock';
const defaultHost = process.env.BOINC_HOST || '127.0.0.1';
const defaultPort = Number(process.env.BOINC_PORT || 31416);
const targetPath = targetFilePath(socketPath);

const ipcDir = path.dirname(socketPath);
fs.mkdirSync(ipcDir, { recursive: true });
try {
  // Web container runs as non-root and must rewrite target.json at runtime.
  fs.chmodSync(ipcDir, 0o777);
} catch {
  // best-effort
}
try {
  fs.unlinkSync(socketPath);
} catch {
  // ignore missing socket
}

if (targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({ host: defaultHost, port: defaultPort, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  }
  try {
    fs.chmodSync(targetPath, 0o666);
  } catch {
    // best-effort
  }
}

const server = net.createServer((client) => {
  const { host, port } = readProxyTarget(targetPath, {
    host: defaultHost,
    port: defaultPort,
  });
  const upstream = net.connect({ host, port }, () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  const fail = (err) => {
    if (err) {
      console.error(`BOINC proxy upstream ${host}:${port}:`, err.message);
    }
    client.destroy();
    upstream.destroy();
  };
  client.on('error', () => fail());
  upstream.on('error', (err) => fail(err));
});

server.on('error', (err) => {
  console.error('BOINC proxy listen error:', err.message);
  process.exit(1);
});

server.listen(socketPath, () => {
  try {
    fs.chmodSync(socketPath, 0o666);
  } catch {
    // best-effort for cross-user container access
  }
  console.log(
    `BOINC proxy ${socketPath} -> dynamic target (${targetPath || 'env'}), default ${defaultHost}:${defaultPort}`,
  );
});

const shutdown = () => {
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
