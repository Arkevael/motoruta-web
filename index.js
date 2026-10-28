// api/index.js - Punto de entrada para Vercel
const app = require('../server/index.js');

// Exportamos la app de Express en lugar de escuchar en un puerto
module.exports = app;