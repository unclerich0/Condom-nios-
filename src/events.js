'use strict';
/**
 * Tiny Server-Sent Events hub. Clients are keyed by user; staff (seguranca/admin)
 * also receive every visit event. Swap for Redis pub/sub when scaling horizontally.
 */
class EventHub {
  constructor() { this.clients = new Set(); }

  add(res, user) {
    const client = { res, user };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));
    return client;
  }

  send(client, event, data) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  toUser(userId, event, data) {
    for (const c of this.clients) if (c.user.id === userId) this.send(c, event, data);
  }

  toStaff(event, data) {
    for (const c of this.clients) if (c.user.role === 'seguranca' || c.user.role === 'admin') this.send(c, event, data);
  }

  heartbeat() {
    for (const c of this.clients) c.res.write(': ping\n\n');
  }
}
module.exports = { EventHub };
