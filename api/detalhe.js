// api/detalhe.js — função serverless da Vercel. Detalhe de um indicador:
// cabeçalho + série do gráfico + estatísticas do período.
import { getDetalhe } from "../server/datalayer.js";

export default async function handler(req, res) {
  const slug = req.query?.slug;
  if (!slug) return res.status(400).json({ error: "Faltou o parâmetro slug" });
  try {
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(await getDetalhe(slug, req.query?.tf || "3M"));
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
