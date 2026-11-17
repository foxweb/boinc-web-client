import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoincClient } from './boincClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const config = {
  host: process.env.BOINC_HOST || '127.0.0.1',
  port: Number(process.env.BOINC_PORT || 31416),
  password: process.env.BOINC_PASSWORD || '',
  socketPath: process.env.BOINC_SOCKET || null,
  httpPort: Number(process.env.PORT || 8080),
  historyIntervalMs: Number(process.env.HISTORY_INTERVAL_MS || 5000),
  historyMaxPoints: Number(process.env.HISTORY_MAX_POINTS || 240),
};

const client = new BoincClient(config);
const app = express();
app.use(cors());
app.use(express.json());

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
    endpoint: config.socketPath
      ? { socket: config.socketPath }
      : { host: config.host, port: config.port },
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
    passwordSet: Boolean(config.password),
    historyIntervalMs: config.historyIntervalMs,
  });
});

app.post('/api/config', (req, res) => {
  const { host, port, password } = req.body || {};
  if (host) config.host = String(host).trim();
  if (port) config.port = Number(port);
  if (password != null && password !== '') config.password = String(password);
  client.host = config.host;
  client.port = config.port;
  client.password = config.password;
  liveHistory.length = 0;
  lastOverview = null;
  sampleOnce();
  res.json({ ok: true, host: config.host, port: config.port, socketPath: config.socketPath });
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
      ? `BOINC via unix socket ${config.socketPath}`
      : `Proxying GUI RPC ${config.host}:${config.port}`,
  );
  sampleOnce();
  setInterval(sampleOnce, config.historyIntervalMs);
});
