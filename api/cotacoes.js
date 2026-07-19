// api/cotacoes.js — função serverless da Vercel. Lista categorizada de todos os
// indicadores de café (futuros, CEPEA, exportação, físico regional).
import { getCotacoes } from "../server/datalayer.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(await getCotacoes());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
