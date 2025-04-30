// history/index.js
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

// on accepte les requetes CORS pour acceder à l'API depuis la page web (vu qu'on sert pas la page avec un serveur web)
const cors = require('cors');
app.use(cors({ origin: '*' }));

const HISTORY_PORT = 4000;

// Pour recevoir du JSON
app.use(express.json());

// URL de MongoDB (via variable d'environnement)
const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const client = new MongoClient(MONGO_URL);
let db;

// Connexion à MongoDB
client.connect()
  .then(() => {
    db = client.db('portscanner');
    console.log("Connecté à MongoDB dans History Service");
  })
  .catch(err => console.error("Erreur de connexion à MongoDB", err));

app.post('/history', async (req, res) => {
  const scanData = req.body;
  if (!scanData.host || !scanData.results) {
    return res.status(400).json({ error: "Données incomplètes" });
  }

  try {
    await db.collection('scans').insertOne(scanData);
    res.status(201).json({ message: "Scan enregistré" });
  } catch (err) {
    console.error("Erreur lors de l'insertion en BDD", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

app.get('/history', async (req, res) => {
  try {
    const scans = await db.collection('scans').find({}).toArray();
    // Pour chaque scan, on garde uniquement les ports dont le status est 'open'
    const filteredScans = scans.map(scan => ({
      host: scan.host,
      date: scan.date,
      results: scan.results.filter(result => result.status === 'open')
    }));
    res.json(filteredScans);
  } catch (err) {
    console.error("Erreur lors de la récupération de l'historique :", err);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique" });
  }
});


app.listen(HISTORY_PORT, () => {
  console.log(`History Service démarré sur le port ${HISTORY_PORT}`);
});
