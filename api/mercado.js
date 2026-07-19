// api/mercado.js — função serverless da Vercel. Tabela de índices (1D/30D/12M),
// spread arábica×robusta e séries para os gráficos comparativos.
import { getMercado } from "../server/datalayer.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(await getMercado());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
