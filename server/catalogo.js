// server/catalogo.js — catálogo dos indicadores fixos (futuros, indicadores
// CEPEA/ESALQ e prêmio de exportação). O mercado físico regional é dinâmico
// (vem das tabelas por praça da Notícias Agrícolas), então não é enumerado
// aqui — ver providers/noticiasagricolas.js.
//
// Cada item define como o indicador é lido e exibido:
//   slug      — identificador estável usado nas rotas /api
//   nome      — rótulo em português
//   categoria — agrupa na tela de Cotações
//   unidade   — unidade nativa: USD_BUSHEL | USD_SACA | USD_TON_CURTA | USD_LB | BRL_SACA | BRL_TON
//   moeda     — rótulo da moeda nativa
//   fonte     — crédito exibido
//   bloomberg — ticker equivalente de referência
//   yahoo     — símbolo no Yahoo Finance (quando há histórico gratuito)
//   descricao — nota explicativa

export const CATEGORIAS = {
  FUTUROS: "Futuros da soja (bolsas)",
  CEPEA: "Indicadores CEPEA/ESALQ",
  EXPORTACAO: "Exportação e paridade",
  FISICO: "Mercado físico regional",
  DERIVADOS: "Farelo e óleo (complexo soja)",
};

export const CATALOGO = [
  {
    slug: "cbot-soja",
    nome: "Soja — Bolsa de Chicago (CBOT)",
    categoria: CATEGORIAS.FUTUROS,
    unidade: "USD_BUSHEL",
    moeda: "US$/bushel",
    fonte: "CME Group / CBOT (via Notícias Agrícolas)",
    bloomberg: "S 1 Comdty",
    yahoo: "ZS=F",
    descricao:
      "Referência global do preço da soja em grão, negociada em Chicago. É o principal balizador para o exportador brasileiro — o preço interno segue CBOT + prêmio + câmbio.",
  },
  {
    slug: "b3-soja",
    nome: "Soja CME — B3 (Brasil)",
    categoria: CATEGORIAS.FUTUROS,
    unidade: "USD_SACA",
    moeda: "US$/saca",
    fonte: "B3 (via Notícias Agrícolas)",
    bloomberg: "SFI1 Comdty",
    descricao:
      "Contrato futuro de soja negociado na B3 em dólares por saca de 60 kg — a unidade padrão brasileira, com liquidação referenciada em Chicago.",
  },
  {
    slug: "cepea-paranagua",
    nome: "Indicador Soja ESALQ/B3 — Paranaguá",
    categoria: CATEGORIAS.CEPEA,
    unidade: "BRL_SACA",
    moeda: "R$/saca",
    fonte: "CEPEA-ESALQ/USP e B3 (via Notícias Agrícolas)",
    bloomberg: "BOISPGPR Index",
    cepeaId: 92,
    cepeaFonte: "soja",
    descricao:
      "Indicador do porto de Paranaguá (PR) — a principal referência do preço da soja para exportação no Brasil, usada na liquidação do contrato da B3.",
  },
  {
    slug: "cepea-parana",
    nome: "Indicador Soja CEPEA/ESALQ — Paraná",
    categoria: CATEGORIAS.CEPEA,
    unidade: "BRL_SACA",
    moeda: "R$/saca",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    bloomberg: "BOISSJPR Index",
    cepeaId: 12,
    cepeaFonte: "soja",
    descricao:
      "Indicador do mercado disponível no interior do Paraná — reflete o preço ao produtor, tipicamente abaixo do porto pela logística.",
  },
  {
    slug: "premio-paranagua",
    nome: "Prêmio de exportação — Paranaguá",
    categoria: CATEGORIAS.EXPORTACAO,
    unidade: "USD_BUSHEL",
    moeda: "US$/bushel",
    fonte: "Mercado de exportação (via Notícias Agrícolas)",
    descricao:
      "Ágio (ou deságio) pago sobre a cotação de Chicago pela soja embarcada em Paranaguá. Prêmio alto = demanda forte pela soja brasileira (ex.: China comprando na entressafra americana).",
  },
  {
    slug: "cbot-farelo",
    nome: "Farelo de Soja — Chicago (CBOT)",
    categoria: CATEGORIAS.DERIVADOS,
    unidade: "USD_TON_CURTA",
    moeda: "US$/ton curta",
    fonte: "CME Group / CBOT (via Notícias Agrícolas)",
    bloomberg: "SM1 Comdty",
    yahoo: "ZM=F",
    descricao:
      "Futuro do farelo de soja (ração animal) em Chicago, em dólares por tonelada curta (907 kg). Puxa a margem de esmagamento junto com o óleo.",
  },
  {
    slug: "cbot-oleo",
    nome: "Óleo de Soja — Chicago (CBOT)",
    categoria: CATEGORIAS.DERIVADOS,
    unidade: "USD_LB",
    moeda: "US$/lb",
    fonte: "CME Group / CBOT (via Notícias Agrícolas)",
    bloomberg: "BO1 Comdty",
    yahoo: "ZL=F",
    descricao:
      "Futuro do óleo de soja em Chicago, em dólares por libra-peso. Sensível à demanda por biodiesel e aos óleos vegetais concorrentes (palma, canola).",
  },
];

export const porSlug = Object.fromEntries(CATALOGO.map((c) => [c.slug, c]));
