import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoincClient } from './boincClient.js';
import { isLocalBoincHost, targetFilePath, writeProxyTarget } from './boincTarget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const localSocketPath = process.env.BOINC_SOCKET || null;

const config = {
  host: process.env.BOINC_HOST || '127.0.0.1',
  port: Number(process.env.BOINC_PORT || 31416),
  password: process.env.BOINC_PASSWORD || '',
  /** Effective client transport: unix socket when a local proxy socket is configured. */
  socketPath: localSocketPath,
  /** Immutable env socket path used for the host-network proxy optimization. */
  localSocketPath,
  httpPort: Number(process.env.PORT || 8080),
  historyIntervalMs: Number(process.env.HISTORY_INTERVAL_MS || 5000),
  historyMaxPoints: Number(process.env.HISTORY_MAX_POINTS || 240),
};

const client = new BoincClient(config);
const app = express();
app.use(cors());
app.use(express.json());

/**
 * Apply host/port/password to the BOINC client.
 *
 * - With BOINC_SOCKET (Docker): always talk to the host-network proxy via unix
 *   socket, and point the proxy at the requested host:port through target.json.
 *   That keeps local BOINC working behind UFW and allows remote LAN GUI RPC.
 * - Without a socket (dev): connect with plain TCP to host:port.
 */
function applyBoincEndpoint() {
  const host = String(config.host || '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(config.port) || 31416;
  config.host = host;
  config.port = port;

  if (config.localSocketPath) {
    const proxyHost = isLocalBoincHost(host) ? '127.0.0.1' : host;
    writeProxyTarget(targetFilePath(config.localSocketPath), {
      host: proxyHost,
      port,
    });
    config.socketPath = config.localSocketPath;
  } else {
    config.socketPath = null;
  }

  client.host = config.host;
  client.port = config.port;
  client.password = config.password;
  client.socketPath = config.socketPath;
}

applyBoincEndpoint();

/** In-memory live samples for utilization / active-task charts. */
const liveHistory = [];
let lastOverview = null;
let lastError = null;
let sampling = false;

async function sampleOnce() {
  if (sampling) return;
  sampling = true;
  try {
    const overview = await client.getOverview();
    lastOverview = overview;
    lastError = null;
    liveHistory.push({
      t: Date.now(),
      active: overview.derived.activeCount,
      running: overview.derived.runningCount,
      cpuUtilization: overview.derived.cpuUtilization,
      gpuUtilization: overview.derived.gpuUtilization,
      currentGflops: overview.derived.currentGflops,
      avgFractionDone:
        overview.results.filter((r) => r.active).reduce((s, r) => s + r.fractionDone, 0) /
          Math.max(1, overview.derived.activeCount) || 0,
    });
    while (liveHistory.length > config.historyMaxPoints) liveHistory.shift();
  } catch (err) {
    lastError = { message: err.message, at: new Date().toISOString() };
  } finally {
    sampling = false;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    endpoint: {
      host: config.host,
      port: config.port,
      ...(config.socketPath ? { socket: config.socketPath, via: 'unix-socket-proxy' } : { via: 'tcp' }),
    },
    lastError,
    samples: liveHistory.length,
    fetchedAt: lastOverview?.fetchedAt ?? null,
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    host: config.host,
    port: config.port,
    socketPath: config.socketPath,
    localSocketPath: config.localSocketPath,
    via: config.socketPath ? 'unix-socket-proxy' : 'tcp',
    passwordSet: Boolean(config.password),
    historyIntervalMs: config.historyIntervalMs,
  });
});

app.post('/api/config', (req, res) => {
  const { host, port, password } = req.body || {};
  if (host) config.host = String(host).trim();
  if (port) config.port = Number(port);
  if (password != null && password !== '') config.password = String(password);
  applyBoincEndpoint();
  liveHistory.length = 0;
  lastOverview = null;
  lastError = null;
  sampleOnce();
  res.json({
    ok: true,
    host: config.host,
    port: config.port,
    socketPath: config.socketPath,
    via: config.socketPath ? 'unix-socket-proxy' : 'tcp',
  });
});

app.get('/api/overview', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || !lastOverview;
    if (force) await sampleOnce();
    if (!lastOverview) throw new Error(lastError?.message || 'No data yet');
    res.json({
      ...lastOverview,
      liveHistory,
      lastError,
    });
  } catch (err) {
    res.status(502).json({ error: err.message, lastError });
  }
});

app.get('/api/history', (_req, res) => {
  res.json({ points: liveHistory, lastError });
});

const clientDist = path.join(root, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Build the client with: npm run build');
  });
});

app.listen(config.httpPort, '0.0.0.0', () => {
  console.log(`BOINC web client API on http://127.0.0.1:${config.httpPort}`);
  console.log(
    config.socketPath
      ? `BOINC ${config.host}:${config.port} via unix-socket proxy ${config.socketPath}`
      : `BOINC direct TCP ${config.host}:${config.port}`,
  );
  sampleOnce();
  setInterval(sampleOnce, config.historyIntervalMs);
});
