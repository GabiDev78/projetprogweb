// scanner/index.js
const express = require('express');

const net = require('net');
const axios = require('axios');

const app = express();

// on accepte les requetes CORS pour acceder à l'API depuis la page web (vu qu'on sert pas la page avec un serveur web)
// à modifier si mise en prod ou déploiement sur internet !!
const cors = require('cors');
app.use(cors({ origin: '*' }));

const SCANNER_PORT = 3000;

// url du service history
const HISTORY_URL = process.env.HISTORY_URL || 'http://history-service:4000/history';

/**
 * on scanne un port unique et on retourne un objet avec le statut et si il est ouvert la banniere du service associé
 * @param {string} host
 * @param {number} port
 * @param {number} timeout (ms)
 * @returns {Promise<{port: number, status: string, banner: string}>}
 */
function scanPort(host, port, timeout = 1000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let status = 'closed';
    let banner = '';
    let timer = setTimeout(() => {
      socket.destroy();
    }, timeout);

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      status = 'open';
      // connexion etablie, maintenant on attend pour recup la bannière
      socket.once('data', data => {
        banner = data.toString().trim();
      });
      // on laisse qques millisec pour attraper la banniere
      setTimeout(() => {
        clearTimeout(timer);
        socket.destroy();
      }, 50);
    });

    socket.on('timeout', () => {
      clearTimeout(timer);
      socket.destroy();
    });

    socket.on('error', () => {
      clearTimeout(timer);
      // si y a un erreur, on va considerer que le port est fermé
    });

    socket.on('close', () => {
      resolve({ port, status, banner });
    });

    socket.connect(port, host);
  });
}

/**
 * on scanne une plage de ports en meme temps, plage par plage
 * @param {string} host
 * @param {number} start
 * @param {number} end
 * @param {number} batchSize
 * @returns {Promise<Array<{port: number, status: string, banner: string}>>}
 */
async function scanPortsInBatches(host, start, end, batchSize = 100) {
  const results = [];
  const ports = [];
  for (let p = start; p <= end; p++) {
    ports.push(p);
  }
  // on traite les ports par lot en utilisant promise et la programmation concurentielle
  for (let i = 0; i < ports.length; i += batchSize) {
    const batch = ports.slice(i, i + batchSize);
    // on lance tout en parallele et on attend les promises
    const batchResults = await Promise.all(batch.map(port => scanPort(host, port)));
    results.push(...batchResults);
  }
  return results;
}

app.get('/scan', async (req, res) => {
  const host = req.query.host;
  if (!host) {
    return res.status(400).json({ error: "Le paramètre 'host' est obligatoire !!" });
  }

  const start = parseInt(req.query.start) || 1;
  const end = parseInt(req.query.end) || 1024;
  const fastMode = req.query.fast === 'true';

  let results = [];

  try {
    // pour fastmode on augmente le nb de batchs
    const batchSize = fastMode ? 200 : 100;
    results = await scanPortsInBatches(host, start, end, batchSize);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors du scan", details: error.message });
  }

  // on envoie au service history
  try {
    await axios.post(HISTORY_URL, {
      host,
      start,
      end,
      results,
      date: new Date()
    });
  } catch (err) {
    console.error("Erreur lors de l'envoi au History Service :", err.message);
  }

  res.json({ host, start, end, results });
});

app.listen(SCANNER_PORT, () => {
  console.log(`Scanner Service démarré sur le port ${SCANNER_PORT}`);
});
