// Luo esimerkkiotteluita ja satunnaisia vastauksia dashboardin kokeilua varten.
// Käyttö: npm run seed
const path = require('node:path');
const { openDb } = require('../src/db');
const { seedDemoData } = require('../src/demo-data');

seedDemoData(openDb(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'palaute.db')));
