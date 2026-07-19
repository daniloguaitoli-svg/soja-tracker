// server/datalayer.js — fachada da camada de dados.
//
// A UI conversa só com este módulo (via /api). Ele combina as fontes gratuitas:
//   - Notícias Agrícolas (primária): indicadores CEPEA/ESALQ, futuros CBOT/B3,
//     prêmio de exportação e mercado físico regional (snapshot atual);
//   - Banco Central (câmbio USD/EUR, com histórico);
//   - Yahoo (histórico de CBOT soja/farelo/óleo);
//   - widget CEPEA (fallback dos indicadores).
// Soja em grão é normalizada para R$/saca de 60 kg; farelo e óleo, para R$/t.

import { CATALOGO, CATEGORIAS, porSlug } from "./catalogo.js";
import { lerNoticiasAgricolas } from "./providers/noticiasagricolas.js";
import { usdbrl as getUsdbrl, getCambio as getCambioBCB } from "./providers/bcb.js";
import { historicoCBOT, SIMBOLOS } from "./providers/yahoo.js";
import { widgetCepea } from "./providers/cepea.js";
import { serieUSD } from "./providers/bcb.js";
import { getClima as getClimaOM } from "./providers/openmeteo.js";
import { registrar, serieSnapshots } from "./store.js";
import {
  paraReaisPorSaca,
  deReaisPorSaca,
  paraReaisPorTon,
  arred,
  hojeISO,
  isoDeBR,
  diasUteisEntre,
  BUSHEL_POR_SACA,
} from "./util.js";

// Um preço é considerado "desatualizado" quando a fonte não publica valor novo
// há mais de 2 dias ÚTEIS (fins de semana não contam; a folga absorve feriados).
const LIMITE_DIAS_UTEIS = 2;

// Anota o item com data ISO + estado de atualização.
function anotarData(item, dataBR) {
  const dataISO = isoDeBR(dataBR) || (typeof dataBR === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dataBR) ? dataBR : null);
  const dias = dataISO ? diasUteisEntre(dataISO, hojeISO()) : null;
  item.data = dataISO;
  item.diasSemAtualizar = dias;
  item.desatualizado = dias == null ? true : dias > LIMITE_DIAS_UTEIS;
  return item;
}

const AVISO =
  "Dados de fontes públicas (CEPEA/ESALQ, CME/CBOT, B3, IMEA, Banco Central via Notícias Agrícolas), " +
  "possivelmente com atraso. Uso informativo — não é recomendação de investimento.";

function slugFisico(item, prefixo = "fisico") {
  const base = `${item.municipio}-${item.cooperativa || ""}-${item.grupo}`;
  const ascii = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${prefixo}-${ascii}`;
}

// Futuro/prêmio de soja em grão: normaliza para R$/saca.
function itemFuturo(slug, dado, usd) {
  const cat = porSlug[slug];
  if (!dado || !dado.curva?.length) return null;
  const front = dado.curva[0];
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(front.valor, cat.unidade === "USD_BUSHEL" ? 4 : 2),
      valorBRLsaca: arred(paraReaisPorSaca({ valor: front.valor, unidade: cat.unidade, usdbrl: usd })),
      variacaoPct: arred(front.variacaoPct),
      contrato: front.contrato,
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
    },
    dado.data
  );
}

// Derivados (farelo/óleo de Chicago): normaliza para R$/tonelada métrica.
function itemDerivado(slug, dado, usd) {
  const cat = porSlug[slug];
  if (!dado || !dado.curva?.length) return null;
  const front = dado.curva[0];
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(front.valor, cat.unidade === "USD_LB" ? 4 : 2),
      valorBRLton: arred(paraReaisPorTon({ valor: front.valor, unidade: cat.unidade, usdbrl: usd })),
      variacaoPct: arred(front.variacaoPct),
      contrato: front.contrato,
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
    },
    dado.data
  );
}

function itemCepea(slug, dado) {
  const cat = porSlug[slug];
  if (!dado) return null;
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(dado.valor),
      valorBRLsaca: arred(dado.valor),
      variacaoPct: arred(dado.variacaoPct),
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
    },
    dado.data
  );
}

export async function getCotacoes() {
  // Série do BCB (cacheada) dá o valor E a data real da última PTAX publicada.
  const usdSerie = await serieUSD();
  const usdUltimo = usdSerie[usdSerie.length - 1] || null;
  const usd = usdUltimo?.close ?? (await getUsdbrl());
  let na = null;
  try {
    na = await lerNoticiasAgricolas();
  } catch {
    na = null;
  }

  // ---- Futuros da soja em grão ----
  const futuros = [];
  if (na) {
    for (const slug of ["cbot-soja", "b3-soja"]) {
      const it = itemFuturo(slug, na.futuros[slug], usd);
      if (it) futuros.push(it);
    }
  }

  // ---- Indicadores CEPEA/ESALQ (com fallback ao widget) ----
  const cepea = [];
  for (const slug of ["cepea-paranagua", "cepea-parana"]) {
    let dado = na?.cepea?.[slug] || null;
    if (!dado) {
      try {
        dado = await widgetCepea(porSlug[slug].cepeaId, porSlug[slug].cepeaFonte);
      } catch {
        dado = null;
      }
    }
    const it = itemCepea(slug, dado);
    if (it) {
      cepea.push(it);
      // Grava sob a data REAL do preço (ISO); se a fonte não informar, usa hoje.
      await registrar(slug, it.data || hojeISO(), it.valorBRLsaca);
    }
  }

  // ---- Exportação e paridade ----
  const exportacao = [];
  const cbot = futuros.find((f) => f.slug === "cbot-soja");
  const cepeaPGua = cepea.find((c) => c.slug === "cepea-paranagua");

  const premio = na ? itemFuturo("premio-paranagua", na.futuros["premio-paranagua"], usd) : null;
  if (premio) {
    exportacao.push(premio);
    await registrar("premio-paranagua", premio.data || hojeISO(), premio.valorBRLsaca);
  }

  // Paridade = (CBOT + prêmio) convertido para R$/saca. Sem prêmio, usa só o CBOT.
  if (cbot && cbot.valor != null) {
    const premioBu = premio?.valor ?? 0;
    const paridade = paraReaisPorSaca({
      valor: cbot.valor + premioBu,
      unidade: "USD_BUSHEL",
      usdbrl: usd,
    });
    const dataBase =
      premio?.data && cbot.data ? (premio.data < cbot.data ? premio.data : cbot.data) : cbot.data;
    exportacao.push(
      anotarData(
        {
          slug: "paridade-cbot-brl",
          nome: premio
            ? "Paridade de exportação (CBOT + prêmio, em R$/saca)"
            : "Paridade de exportação (CBOT em R$/saca)",
          categoria: CATEGORIAS.EXPORTACAO,
          moeda: "R$/saca",
          unidade: "BRL_SACA",
          valor: arred(paridade),
          valorBRLsaca: arred(paridade),
          variacaoPct: cbot.variacaoPct,
          fonte: premio ? "Derivado: (CBOT + prêmio Paranaguá) × PTAX" : "Derivado: CBOT × PTAX",
          descricao:
            "Preço de Chicago somado ao prêmio de Paranaguá e convertido para R$ por saca de 60 kg — a paridade bruta de exportação no porto.",
        },
        dataBase
      )
    );

    if (cepeaPGua && cepeaPGua.valorBRLsaca != null && paridade != null) {
      const dif = cepeaPGua.valorBRLsaca - paridade;
      // Herda a data mais ANTIGA dos componentes: o derivado só é tão fresco
      // quanto o insumo menos atualizado.
      const dataMaisAntiga =
        dataBase && cepeaPGua.data ? (dataBase < cepeaPGua.data ? dataBase : cepeaPGua.data) : dataBase || cepeaPGua.data;
      exportacao.push(
        anotarData(
          {
            slug: "diferencial-cepea-paridade",
            nome: "Diferencial Paranaguá × paridade CBOT (aprox.)",
            categoria: CATEGORIAS.EXPORTACAO,
            moeda: "R$/saca",
            unidade: "BRL_SACA",
            valor: arred(dif),
            valorBRLsaca: arred(dif),
            variacaoPct: null,
            fonte: "Derivado: CEPEA Paranaguá − paridade CBOT",
            descricao:
              "Diferença entre o indicador de Paranaguá e a paridade CBOT + prêmio. Positivo = mercado interno pagando acima da paridade de exportação. Aproximação (não considera custos portuários e frete).",
          },
          dataMaisAntiga
        )
      );
    }
  }

  // ---- Mercado físico regional (grão) ----
  const fisico = [];
  if (na?.fisico?.length) {
    for (const item of na.fisico) {
      const slug = slugFisico(item);
      const it = anotarData(
        {
          slug,
          nome: item.local,
          subgrupo: item.grupo,
          categoria: CATEGORIAS.FISICO,
          moeda: "R$/saca",
          unidade: "BRL_SACA",
          valor: arred(item.valor),
          valorBRLsaca: arred(item.valor),
          variacaoPct: arred(item.variacaoPct),
          municipio: item.municipio,
          cooperativa: item.cooperativa,
          fonte: "Mercado físico (via Notícias Agrícolas)",
        },
        item.data
      );
      fisico.push(it);
      await registrar(slug, it.data || hojeISO(), item.valor);
    }
  }

  // ---- Farelo e óleo ----
  const derivados = [];
  if (na) {
    for (const slug of ["cbot-farelo", "cbot-oleo"]) {
      const it = itemDerivado(slug, na.futuros[slug], usd);
      if (it) derivados.push(it);
    }
    for (const item of na.fareloFisico || []) {
      const slug = slugFisico(item, "farelo");
      const it = anotarData(
        {
          slug,
          nome: item.local,
          subgrupo: item.grupo,
          categoria: CATEGORIAS.DERIVADOS,
          moeda: "R$/t",
          unidade: "BRL_TON",
          valor: arred(item.valor),
          valorBRLton: arred(item.valor),
          variacaoPct: arred(item.variacaoPct),
          municipio: item.municipio,
          cooperativa: item.cooperativa,
          fonte: "Farelo — mercado interno (via Notícias Agrícolas)",
        },
        item.data
      );
      derivados.push(it);
      await registrar(slug, it.data || hojeISO(), item.valor);
    }
  }

  const categorias = [
    { nome: CATEGORIAS.FUTUROS, itens: futuros },
    { nome: CATEGORIAS.CEPEA, itens: cepea },
    { nome: CATEGORIAS.EXPORTACAO, itens: exportacao },
    { nome: CATEGORIAS.FISICO, itens: fisico },
    { nome: CATEGORIAS.DERIVADOS, itens: derivados },
  ].filter((c) => c.itens.length);

  const cambio = anotarData({ usdbrl: arred(usd, 4) }, usdUltimo?.date || null);

  return {
    fetchedAt: na?.fetchedAt || new Date().toISOString(),
    cambio,
    fatorSaca: arred(BUSHEL_POR_SACA, 4),
    categorias,
    aviso: AVISO,
  };
}

// Estatísticas simples de uma série [{date, close}].
function estatisticas(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const closes = pontos.map((p) => p.close);
  const ult = closes[closes.length - 1];
  const prim = closes[0];
  return {
    min: arred(Math.min(...closes)),
    max: arred(Math.max(...closes)),
    variacaoPeriodoPct: prim ? arred(((ult - prim) / prim) * 100) : null,
  };
}

const UNIDADE_YAHOO = {
  "cbot-soja": "US$/bushel",
  "cbot-farelo": "US$/ton curta",
  "cbot-oleo": "US$/lb",
};

export async function getDetalhe(slug, tf = "3M") {
  // Precisa das cotações atuais (snapshot) para o cabeçalho de qualquer slug.
  const cot = await getCotacoes();
  const item =
    cot.categorias.flatMap((c) => c.itens).find((i) => i.slug === slug) || null;

  let pontos = [];
  let unidadeSerie = item?.moeda || "";
  let notaHistorico = null;

  const ehFareloOleo = slug === "cbot-farelo" || slug.startsWith("farelo-");

  if (SIMBOLOS[slug]) {
    try {
      pontos = await historicoCBOT(slug, tf); // unidade nativa de Chicago
      unidadeSerie = UNIDADE_YAHOO[slug];
    } catch {
      pontos = await serieSnapshots(slug);
      unidadeSerie = ehFareloOleo ? "R$/t" : "R$/saca";
      notaHistorico = "Histórico do Yahoo indisponível; usando snapshots locais.";
    }
  } else {
    pontos = await serieSnapshots(slug);
    unidadeSerie = ehFareloOleo ? "R$/t" : "R$/saca";
    if (pontos.length < 2) {
      notaHistorico =
        "Sem série histórica gratuita para este indicador — o gráfico é construído a partir dos snapshots diários e cresce com o uso do app.";
    }
  }

  return {
    slug,
    item,
    tf,
    unidadeSerie,
    pontos,
    estatisticas: estatisticas(pontos),
    notaHistorico,
    aviso: cot.aviso,
  };
}

export async function getCambio() {
  return getCambioBCB();
}

// Variação % entre o último ponto e o ponto mais próximo de ~diasAtras dias antes.
// Retorna null se a série não alcança essa janela (evita "30D" falso quando só há
// poucos dias de histórico, como nos snapshots recém-iniciados do CEPEA).
function varDias(pontos, diasAtras) {
  if (!pontos || pontos.length < 2) return null;
  const ult = pontos[pontos.length - 1];
  const alvoMs = new Date(ult.date).getTime() - diasAtras * 864e5;
  const tol = Math.max(7, diasAtras * 0.2) * 864e5; // tolerância proporcional
  let ref = null;
  let melhor = Infinity;
  for (const p of pontos) {
    const gap = Math.abs(new Date(p.date).getTime() - alvoMs);
    if (gap < melhor) { melhor = gap; ref = p; }
  }
  if (!ref || !ref.close || melhor > tol) return null;
  return arred(((ult.close - ref.close) / ref.close) * 100);
}

// Aba "Mercado": tabela de índices (1D/30D/12M), margem de esmagamento (crush)
// e séries para os gráficos comparativos.
export async function getMercado() {
  const [cot, sojaHist, fareloHist, oleoHist, usdHist] = await Promise.all([
    getCotacoes(),
    historicoCBOT("cbot-soja", "1A").catch(() => []),
    historicoCBOT("cbot-farelo", "1A").catch(() => []),
    historicoCBOT("cbot-oleo", "1A").catch(() => []),
    serieUSD().catch(() => []),
  ]);
  const itens = cot.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);
  const cepeaHist = await serieSnapshots("cepea-paranagua").catch(() => []);

  const cbot = get("cbot-soja");
  const farelo = get("cbot-farelo");
  const oleo = get("cbot-oleo");
  const cepeaPGua = get("cepea-paranagua");
  const premio = get("premio-paranagua");
  const usd = cot.cambio.usdbrl;

  const indices = [
    cbot && { nome: "Soja CBOT (Chicago)", unidade: "US$/bushel", valor: cbot.valor, var1d: cbot.variacaoPct, var30d: varDias(sojaHist, 30), var12m: varDias(sojaHist, 365), data: cbot.data, desatualizado: cbot.desatualizado },
    cepeaPGua && { nome: "CEPEA Paranaguá", unidade: "R$/saca", valor: cepeaPGua.valor, var1d: cepeaPGua.variacaoPct, var30d: varDias(cepeaHist, 30), var12m: varDias(cepeaHist, 365), data: cepeaPGua.data, desatualizado: cepeaPGua.desatualizado },
    premio && { nome: "Prêmio Paranaguá", unidade: "US$/bushel", valor: premio.valor, var1d: premio.variacaoPct, var30d: null, var12m: null, data: premio.data, desatualizado: premio.desatualizado },
    farelo && { nome: "Farelo CBOT", unidade: "US$/ton curta", valor: farelo.valor, var1d: farelo.variacaoPct, var30d: varDias(fareloHist, 30), var12m: varDias(fareloHist, 365), data: farelo.data, desatualizado: farelo.desatualizado },
    oleo && { nome: "Óleo CBOT", unidade: "US$/lb", valor: oleo.valor, var1d: oleo.variacaoPct, var30d: varDias(oleoHist, 30), var12m: varDias(oleoHist, 365), data: oleo.data, desatualizado: oleo.desatualizado },
    usd != null && { nome: "Dólar comercial", unidade: "R$/US$", valor: usd, var1d: null, var30d: varDias(usdHist, 30), var12m: varDias(usdHist, 365), data: cot.cambio.data, desatualizado: cot.cambio.desatualizado },
  ].filter(Boolean);

  // Margem de esmagamento (board crush da CBOT, em US$/bushel):
  //   crush = farelo(US$/ton curta) × 0,022 + óleo(US$/lb) × 11 − soja(US$/bushel)
  // (1 bushel rende ~44 lb de farelo e ~11 lb de óleo.)
  let crush = null;
  if (cbot && farelo && oleo && cbot.valor != null && farelo.valor != null && oleo.valor != null) {
    const receita = farelo.valor * 0.022 + oleo.valor * 11;
    crush = {
      valor: arred(receita - cbot.valor, 2),
      farelo: arred(farelo.valor * 0.022, 2),
      oleo: arred(oleo.valor * 11, 2),
      soja: arred(cbot.valor, 2),
    };
  }

  return {
    fetchedAt: cot.fetchedAt,
    cambio: cot.cambio,
    indices,
    crush,
    charts: {
      cbot: sojaHist.map((p) => ({ date: p.date, close: p.close })),
      usd: usdHist.map((p) => ({ date: p.date, close: p.close })),
      cepea: cepeaHist,
    },
    aviso: cot.aviso,
  };
}

export async function getClima() {
  return getClimaOM();
}

// Exposto para o conversor no cliente, se necessário no futuro.
export { paraReaisPorSaca, deReaisPorSaca };
