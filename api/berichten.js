// GET /api/berichten — blogfeed + activiteitenfeed van Ning, samengevoegd tot
// berichten mét hun volledige reactiedraad. Zie README voor het algoritme.

import { haalBerichten } from "../lib/ning.js";

const MAX_AGE_S = 120;   // CDN mag 2 min oud serveren
const SWR_S = 600;       // en tot 10 min stale terwijl hij ververst

const TOEGESTAAN = [
  "https://www.nederlanders.fr",
  "https://nederlanders.fr",
  "https://cafeclaude.fr",
  "https://www.cafeclaude.fr",
  "https://infofrankrijk.com",
  "https://www.infofrankrijk.com",
  "https://nedergids.nl",
  "https://www.nedergids.nl",
];

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (TOEGESTAAN.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o))) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let data;
  try {
    data = await haalBerichten();
  } catch (e) {
    // Nooit een harde fout naar de client: de pagina moet blijven staan.
    data = { berichten: [], wezen: [], bronStatus: { berichten: "fout", activiteit: "fout" } };
  }

  const swr = \`public, s-maxage=\${MAX_AGE_S}, stale-while-revalidate=\${SWR_S}\`;
  res.setHeader("Cache-Control", \`public, max-age=60, s-maxage=\${MAX_AGE_S}, stale-while-revalidate=\${SWR_S}\`);
  res.setHeader("CDN-Cache-Control", swr);
  res.setHeader("Vercel-CDN-Cache-Control", swr);

  res.status(200).json({ bijgewerkt: new Date().toISOString(), ...data });
}
