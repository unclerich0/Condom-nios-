'use strict';
const webpush = require('web-push');
const { getSetting, setSetting } = require('./db');

function setupPush(db) {
  let pub = process.env.VAPID_PUBLIC_KEY || getSetting(db, 'vapid_public');
  let priv = process.env.VAPID_PRIVATE_KEY || getSetting(db, 'vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey; priv = keys.privateKey;
    setSetting(db, 'vapid_public', pub); setSetting(db, 'vapid_private', priv);
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@condominio.local', pub, priv);

  const listSubs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?');
  const delSub = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

  async function sendToUser(userId, payload) {
    if (process.env.DISABLE_PUSH === '1') return;
    const subs = listSubs.all(userId);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) delSub.run(s.id);
      }
    }));
  }
  return { publicKey: pub, sendToUser };
}
module.exports = { setupPush };
