// GET /api/reacties?post=<blogPostId> — de VOLLEDIGE reactiedraad van één
// bericht, gelezen van de berichtpagina zelf. De activiteitenfeed toont maar een
// paar dagen; hiermee krijg je alle reacties, met de echte tekst.
// Wordt pas aangeroepen als de bezoeker een bericht openklapt.

import { haalDraad } from "../lib/draad.js";
import { cors } from "../lib/cors.js";

const MAX_AGE_S = 300;
const SWR_S = 1800;



export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const post = String((req.query && req.query.post) || "").replace(/[^0-9]/g, "");
  if (!post) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ reacties: [], status: "geen geldig post-id" });
  }

  let data;
  try {
    data = await haalDraad(post, { debug: req.query.debug === "1" });
  } catch (e) {
    data = { reacties: [], status: "fout: " + (e && e.message) };
  }

  if (data.status === "ok") {
    const swr = "public, s-maxage=" + MAX_AGE_S + ", stale-while-revalidate=" + SWR_S;
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=" + MAX_AGE_S + ", stale-while-revalidate=" + SWR_S);
    res.setHeader("CDN-Cache-Control", swr);
    res.setHeader("Vercel-CDN-Cache-Control", swr);
  } else {
    res.setHeader("Cache-Control", "no-store");
  }

  res.status(200).json({ bijgewerkt: new Date().toISOString(), post, ...data });
}
