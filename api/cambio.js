// api/cambio.js — função serverless da Vercel. Câmbio oficial USD/BRL e EUR/BRL
// (PTAX do Banco Central) com série histórica para gráfico e conversões.
import { getCambio } from "../server/datalayer.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(await getCambio());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
