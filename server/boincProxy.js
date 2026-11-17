/**
 * Unix-socket TCP proxy to local BOINC GUI RPC.
 * Host-network sidecar listens on a shared volume socket; the bridge web
 * container connects via the same volume (UFW cannot block unix sockets).
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const socketPath = process.env.BOINC_SOCKET || '/boinc-ipc/gui_rpc.sock';
const targetHost = process.env.BOINC_HOST || '127.0.0.1';
const targetPort = Number(process.env.BOINC_PORT || 31416);

fs.mkdirSync(path.dirname(socketPath), { recursive: true });
try {
  fs.unlinkSync(socketPath);
} catch {
  // ignore missing socket
}

const server = net.createServer((client) => {
  const upstream = net.connect({ host: targetHost, port: targetPort }, () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  const fail = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', fail);
  upstream.on('error', fail);
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
  console.log(`BOINC proxy ${socketPath} -> ${targetHost}:${targetPort}`);
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
