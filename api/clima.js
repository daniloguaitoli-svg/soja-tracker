// api/clima.js — função serverless da Vercel. Chuva acumulada 30 dias vs. média
// histórica, por região cafeeira (Open-Meteo).
import { getClima } from "../server/datalayer.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(await getClima());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
