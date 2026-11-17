/**
 * Tiny TCP proxy: listen on docker0 (or PROXY_BIND) and forward to local BOINC GUI RPC.
 * Used so a bridge-networked web container can reach host BOINC without UFW LAN rules.
 */
import net from 'node:net';

const listenHost = process.env.PROXY_BIND || '172.17.0.1';
const listenPort = Number(process.env.PROXY_PORT || 31417);
const targetHost = process.env.BOINC_HOST || '127.0.0.1';
const targetPort = Number(process.env.BOINC_PORT || 31416);

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

server.listen(listenPort, listenHost, () => {
  console.log(`BOINC proxy ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`);
});
