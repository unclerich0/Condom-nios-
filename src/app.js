'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { authenticate, requireRole } = require('./auth');
const { EventHub } = require('./events');
const { setupPush } = require('./push');
const { createServices } = require('./services');
const { HttpError } = require('./validate');
const visitsRouter = require('./routes/visits');
const { authRouter, residentsRouter, notificationsRouter, pushRouter, adminRouter } = require('./routes/other');
const { TZ } = require('./time');

async function createApp({ db, secureCookies = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' }) {
  const app = express();
  const hub = new EventHub();
  const push = await setupPush(db);
  const svc = createServices(db, hub, push);
  const ctx = { db, hub, push, svc, secureCookies };

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'connect-src': ["'self'"], 'upgrade-insecure-requests': null },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use(authenticate(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true, tz: TZ, time: new Date().toISOString() }));
  app.use('/api/auth', authRouter(ctx));
  app.use('/api/visits', visitsRouter(ctx));
  app.use('/api/residents', residentsRouter(ctx));
  app.use('/api/notifications', notificationsRouter(ctx));
  app.use('/api/push', pushRouter(ctx));
  app.use('/api/admin', adminRouter(ctx));

  // Tempo real (Server-Sent Events)
  app.get('/api/events', requireRole(), (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const client = hub.add(res, req.user);
    hub.send(client, 'hello', { user: req.user.id, role: req.user.role });
  });
  const hb = setInterval(() => hub.heartbeat(), 25000);
  hb.unref();

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  // Frontend estático + rotas das páginas
  const pub = path.join(__dirname, '..', 'public');
  const page = (file) => (_req, res) => res.sendFile(path.join(pub, file));
  app.get('/', page('index.html'));
  app.get('/morador', page('morador.html'));
  app.get('/seguranca', page('seguranca.html'));
  app.get('/admin', page('admin.html'));
  app.use(express.static(pub, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erro interno. Tente novamente.' : err.message });
  });

  app.locals.ctx = ctx;
  return app;
}
module.exports = { createApp };
