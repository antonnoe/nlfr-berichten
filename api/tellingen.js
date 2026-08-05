// GET /api/tellingen — reactieaantallen per bericht. Alleen voor diagnose;
// /api/berichten gebruikt dezelfde functie intern.

import { haalTellingen } from "../lib/tellingen.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  let data;
  try {
    data = await haalTellingen({ debug: req.query && req.query.debug === "1" });
  } catch (e) {
    data = { tellingen: {}, status: "fout: " + (e && e.message) };
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(data);
}
