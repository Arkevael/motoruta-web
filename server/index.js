const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const rateLimit = require('express-rate-limit');
const routeRouter = require('./routes/route');
const { HttpError } = require('./utils/http');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Railway/Fly están detrás de un proxy

// Límite de peticiones por IP (protege las cuotas de las APIs externas)
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests', message: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
  })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/route', routeRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Endpoint no encontrado' }));

// Frontend estático (mismo origen → no hay problemas de CORS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Manejador central de errores: respuesta JSON uniforme, sin trazas internas
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor' });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`MotoRuta Web escuchando en http://localhost:${port}`));
}

module.exports = app;
