// Client-disconnect hook for translation requests + an isolated node:http harness (NOT a product endpoint).
//
// Which event? (Node 24 docs, https://nodejs.org/docs/latest-v24.x/api/http.html)
//  * http.ServerResponse 'close': "Indicates that the response is completed, or its underlying connection was
//    terminated prematurely (before the response completion)."  -> fires in BOTH cases, so the handler must tell them
//    apart with response.writableFinished: "Is true if all data has been flushed to the underlying system, immediately
//    before the 'finish' event is emitted." (writableEnded only says end() was called, not that data was flushed.)
//  * http.IncomingMessage 'close' (what the spec proposed): "Emitted when the request has been completed."; History:
//    "v16.0.0 The close event is now emitted when the request has been completed and not when the underlying socket is
//    closed." So req 'close' is NOT a disconnect signal: it can fire while the handler is still waiting for a translation.
//    IncomingMessage 'aborted' is deprecated since v17 ("Listen for 'close' event instead").
//  * request.socket is the net.Socket; socket 'close' would also work but also fires on keep-alive teardown; the
//    ServerResponse 'close' + writableFinished pair is the documented per-response signal.
//
// Hook: res.once('close', () => { if (!res.writableFinished) abort(); }). The listener is `once` and is also removed
// explicitly (dispose) when the handler answers, so a finished request leaves no listener behind.
import http from 'node:http';

/**
 * @param {http.ServerResponse} res
 * @param {() => void} abort called at most once, only on a PREMATURE disconnect
 * @returns {() => void} dispose: removes the listener (call when the response was written)
 */
export function onClientDisconnect(res, abort) {
  const handler = () => {
    if (!res.writableFinished) abort();
  };
  res.once('close', handler);
  return () => res.removeListener('close', handler);
}

/**
 * Mini harness: GET /t?text=... -> coordinator.translate with an AbortSignal tied to the disconnect hook.
 * `probe` receives events for the tests: { type: 'abort'|'reqClose'|'resClose'|'responded', ... }.
 */
export function createDisconnectServer({ coord, probe = () => {}, org = 'org1' }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ac = new AbortController();
    let aborts = 0;
    req.on('close', () => probe({ type: 'reqClose', responseFinished: res.writableFinished }));
    res.once('close', () => probe({ type: 'resClose', writableFinished: res.writableFinished }));
    const baseline = res.listenerCount('close'); // listeners that are not ours
    const dispose = onClientDisconnect(res, () => {
      aborts++;
      probe({ type: 'abort', n: aborts });
      ac.abort();
    });
    // Drain any request body so the request completes (a POST body would otherwise stay unread).
    req.resume();
    const r = await coord.translate({ organizationId: org, scope: 'bench', storedSource: 'vi', target: 'en', text: url.searchParams.get('text') ?? '', signal: ac.signal });
    dispose();
    probe({ type: 'responded', status: r.status, baseline, listenersAfterDispose: res.listenerCount('close') });
    if (res.destroyed) return;
    const body = JSON.stringify({ status: r.status, reason: r.stats?.reason });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
  return server;
}
