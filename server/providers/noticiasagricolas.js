// server/providers/noticiasagricolas.js — fonte primária (gratuita).
//
// A página pública noticiasagricolas.com.br/cotacoes/soja é HTML renderizado no
// servidor e traz, em tabelas, o essencial do complexo soja: indicadores
// CEPEA/ESALQ (Paranaguá e Paraná), futuros CBOT (soja, farelo e óleo), futuros
// da B3, prêmio de exportação de Paranaguá e o mercado físico por praça
// (inclui MS e IMEA/MT).
//
// A leitura é por REGEX (sem dependências), associando cada <table> ao título
// (<h2>/<h3>) imediatamente anterior. É "melhor esforço": se o HTML mudar, ajustar
// aqui. Os números-chave têm fontes independentes (Yahoo, widget CEPEA) como reforço.

import { parseNumBR } from "../util.js";

const URL_SOJA = "https://www.noticiasagricolas.com.br/cotacoes/soja";
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};
const TTL_MS = 10 * 60 * 1000;
let cache = null; // { ts, dados }

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Extrai [{ heading, header:[...], rows:[[...]], atualizadoEm }] de todo o HTML.
// `atualizadoEm` ("dd/mm/aaaa") vem do rodapé "Atualizado em: ..." que a página
// imprime logo após cada tabela de cotações — é a data real daquele preço.
function extrairTabelas(html) {
  const tabelas = [];
  const reTable = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = reTable.exec(html)) !== null) {
    const antes = html.slice(0, m.index);
    const hs = [...antes.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const heading = hs.length ? strip(hs[hs.length - 1][1]) : "";
    const corpo = m[1];
    const header = [...corpo.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => strip(c[1]));
    const rows = [...corpo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1])))
      .filter((cells) => cells.length > 0);
    // O rodapé "Ver histórico | Atualizado em: dd/mm/aaaa" fica DENTRO da própria
    // <table> (última linha), então basta procurar no corpo dela.
    const atualizadoEm = corpo.match(/Atualizado\s+em:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    tabelas.push({ heading, header, rows, atualizadoEm });
  }
  return tabelas;
}

// Vários títulos da página se contêm ("Soja - Bolsa de Chicago" está dentro de
// "Farelo de Soja - Bolsa de Chicago"), então o casamento é por REGEX no título.
const acha = (tabelas, re) => tabelas.find((t) => re.test(t.heading));

function parseCurvaFuturos(tabela, colValor = 1) {
  if (!tabela) return null;
  const curva = tabela.rows
    .map((cells) => {
      const valor = parseNumBR(cells[colValor]);
      if (valor == null) return null;
      // Última coluna é sempre a variação % (as tabelas CBOT têm também a
      // variação em pontos na penúltima).
      const variacaoPct = parseNumBR(cells[cells.length - 1]);
      return { contrato: cells[0], valor, variacaoPct };
    })
    .filter(Boolean);
  return curva.length ? { curva, data: tabela.atualizadoEm } : null;
}

function parseIndicadorCepea(tabela) {
  if (!tabela || !tabela.rows.length) return null;
  const [data, valorTxt, varTxt] = tabela.rows[0];
  const valor = parseNumBR(valorTxt);
  if (valor == null) return null;
  // A 1ª coluna da linha é a data do indicador; o rodapé é o reserva.
  return { valor, variacaoPct: parseNumBR(varTxt), data: data || tabela.atualizadoEm };
}

function parseFisico(tabela, grupo) {
  if (!tabela) return [];
  return tabela.rows
    .map((cells) => {
      const local = cells[0] || "";
      const valor = parseNumBR(cells[1]);
      if (!local || valor == null) return null;
      // "Não-Me-Toque/RS (Cotrijal)" -> praça + cooperativa/fonte
      const mm = local.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      return {
        local,
        municipio: mm ? mm[1].trim() : local,
        cooperativa: mm ? mm[2].trim() : null,
        valor,
        variacaoPct: parseNumBR(cells[2]),
        grupo,
        data: tabela.atualizadoEm,
      };
    })
    .filter(Boolean);
}

export async function lerNoticiasAgricolas() {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.dados;

  const r = await fetch(URL_SOJA, { headers: UA });
  if (!r.ok) throw new Error(`Notícias Agrícolas indisponível (HTTP ${r.status})`);
  const html = await r.text();
  const tabelas = extrairTabelas(html);

  // Futuros e prêmio (títulos por regex — ver nota acima)
  const cbot = parseCurvaFuturos(acha(tabelas, /^soja\s*[-–]\s*bolsa de chicago/i));
  // Atenção: o título "Indicador da Soja ESALQ/B3 - Paranaguá" também contém
  // "B3" — por isso o casamento exige "Soja CME" (título do contrato da B3).
  const b3 = parseCurvaFuturos(acha(tabelas, /soja\s*cme/i));
  const farelo = parseCurvaFuturos(acha(tabelas, /^farelo.*chicago/i));
  const oleo = parseCurvaFuturos(acha(tabelas, /^[óo]leo.*chicago/i));
  const premio = parseCurvaFuturos(acha(tabelas, /pr[êe]mio/i));

  // Indicadores CEPEA/ESALQ (Paranaguá primeiro — "Paraná" está contido nele)
  const cepeaParanagua = parseIndicadorCepea(acha(tabelas, /indicador.*paranagu[áa]/i));
  const cepeaParana = parseIndicadorCepea(
    acha(tabelas, /indicador.*paran[áa]\s*$/i) ||
      tabelas.find((t) => /indicador.*soja/i.test(t.heading) && /paran[áa]/i.test(t.heading) && !/paranagu/i.test(t.heading))
  );

  // Físico regional (grão) e farelo físico (R$/t)
  const fisico = [
    ...parseFisico(acha(tabelas, /^soja\s*[-–]\s*mercado f[íi]sico\s*$/i), "Soja em grão — praças"),
    ...parseFisico(acha(tabelas, /mercado f[íi]sico\s*[-–]\s*ms/i), "Soja em grão — Mato Grosso do Sul"),
    ...parseFisico(acha(tabelas, /dispon[íi]vel.*imea/i), "Soja disponível — IMEA (MT)"),
  ];
  const fareloFisico = parseFisico(acha(tabelas, /^farelo de soja\s*$/i), "Farelo — mercado interno (R$/t)");

  const dados = {
    fetchedAt: new Date().toISOString(),
    futuros: {
      "cbot-soja": cbot,
      "b3-soja": b3,
      "cbot-farelo": farelo,
      "cbot-oleo": oleo,
      "premio-paranagua": premio,
    },
    cepea: { "cepea-paranagua": cepeaParanagua, "cepea-parana": cepeaParana },
    fisico,
    fareloFisico,
  };
  cache = { ts: Date.now(), dados };
  return dados;
}
