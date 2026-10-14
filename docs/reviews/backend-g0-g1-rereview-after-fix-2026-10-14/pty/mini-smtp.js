// Minimal SMTP sink for the SIGTERM case (no dependencies). Delays the reply to DATA by SLOW_MS.
// Logs only timestamps and recipients, never message bodies.
const net = require('net');
const slow = Number(process.env.SLOW_MS || 0);
net
  .createServer((socket) => {
    let data = false;
    let buffer = '';
    let rcpt = '';
    const say = (line) => socket.write(line + '\r\n');
    say('220 review-sink ESMTP');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      if (data) {
        if (!buffer.includes('\r\n.\r\n')) return;
        data = false;
        buffer = '';
        console.log(new Date().toISOString(), 'DATA complete for', rcpt, 'replying in', slow, 'ms');
        setTimeout(() => {
          console.log(new Date().toISOString(), 'ACCEPTED', rcpt);
          say('250 OK queued');
        }, slow);
        return;
      }
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') say('250 review-sink');
        else if (verb === 'MAIL') say('250 OK');
        else if (verb === 'RCPT') { rcpt = line.slice(8); say('250 OK'); }
        else if (verb === 'DATA') { data = true; say('354 go ahead'); if (buffer.includes('\r\n.\r\n')) socket.emit('data', Buffer.alloc(0)); return; }
        else if (verb === 'QUIT') { say('221 bye'); socket.end(); }
        else if (verb === 'RSET' || verb === 'NOOP') say('250 OK');
        else say('502 not implemented');
      }
    });
    socket.on('error', () => {});
  })
  .listen(2525, () => console.log(new Date().toISOString(), 'sink listening, slow', slow));
