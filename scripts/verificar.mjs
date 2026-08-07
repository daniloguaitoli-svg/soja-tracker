// scripts/verificar.mjs — a verificação que o `npm run build` não faz.
//
// O `vite build` empacota só o src/, então a metade server/ (datalayer,
// catálogo, util, providers) nem chega a ser lida por ele: um erro de sintaxe
// ou de import ali passa verde e só quebra em produção, na hora do request.
// Este script carrega esses módulos de verdade e confere os invariantes que o
// CLAUDE.md declara — inclusive as constantes que são duplicadas de propósito
// entre server/ e src/ e que nada mais consegue vigiar.
//
// Sem dependências de propósito: o repositório não tem test runner e a regra é
// manter só react + react-dom.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFile(join(RAIZ, rel), "utf-8");

let falhas = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const falhar = (msg) => {
  console.error(`  FALHA ${msg}`);
  falhas++;
};
const conferir = (cond, msg) => (cond ? ok(msg) : falhar(msg));

// Lê `const NOME = <expressão numérica>;` de um arquivo do cliente. O Conversor
// é JSX (não dá para importar aqui), e alguns valores são escritos como conta
// (60 / 27.2155422), por isso avalia a expressão em vez de comparar texto.
function constanteDoCliente(fonte, nome) {
  const m = fonte.match(new RegExp(`${nome}\\s*=\\s*([^;\\n]+)`));
  if (!m) return null;
  const expr = m[1].trim();
  if (!/^[\d.\s/*+()-]+$/.test(expr)) return null;
  return Number(Function(`"use strict"; return (${expr});`)());
}

console.log("\nmódulos do servidor carregam");
const datalayer = await import("../server/datalayer.js");
const util = await import("../server/util.js");
const cat = await import("../server/catalogo.js");
const yahoo = await import("../server/providers/yahoo.js");
for (const nome of ["getCotacoes", "getDetalhe", "getCambio", "getMercado", "getClima"]) {
  conferir(typeof datalayer[nome] === "function", `datalayer exporta ${nome}()`);
}
for (const rel of ["noticiasagricolas", "cepea", "bcb", "openmeteo"]) {
  await import(`../server/providers/${rel}.js`);
  ok(`provider ${rel} carrega`);
}
ok("provider yahoo carrega");

console.log("\nintegridade do catálogo");
const { CATALOGO, porSlug } = cat;
conferir(CATALOGO.length > 0, `${CATALOGO.length} indicadores fixos`);
conferir(Object.keys(porSlug).length === CATALOGO.length, "porSlug cobre todo o catálogo (slugs únicos)");

const UNIDADES = ["USD_BUSHEL", "USD_SACA", "USD_TON_CURTA", "USD_LB", "BRL_SACA", "BRL_TON"];
for (const c of CATALOGO) {
  for (const campo of ["slug", "nome", "categoria", "unidade", "moeda", "fonte", "descricao"]) {
    if (!c[campo]) falhar(`${c.slug || "(sem slug)"}: falta ${campo}`);
  }
  if (!UNIDADES.includes(c.unidade)) falhar(`${c.slug}: unidade desconhecida ${c.unidade}`);
  if (c.cepeaId && !c.cepeaFonte) falhar(`${c.slug}: cepeaId sem cepeaFonte`);
}
ok("campos obrigatórios e unidades válidos");

// Todo slug com símbolo do Yahoo precisa existir no catálogo, senão o Detalhe
// tenta um histórico de um indicador que não está mais lá.
for (const slug of Object.keys(yahoo.SIMBOLOS)) {
  if (!porSlug[slug]) falhar(`SIMBOLOS tem "${slug}", que não existe no catálogo`);
}
ok("todo slug de SIMBOLOS existe no catálogo");

console.log("\ncache do CEPEA");
const cache = JSON.parse(await ler("server/cepea-cache.json"));
conferir(!!cache.indicadores, "server/cepea-cache.json é JSON válido e tem `indicadores`");
for (const slug of Object.keys(cache.indicadores)) {
  if (!porSlug[slug]) falhar(`cache tem o slug "${slug}", que não existe mais no catálogo`);
}
ok("todo slug do cache ainda existe no catálogo (histórico não órfão)");

// CLAUDE.md, "Constantes duplicadas de propósito": server/ e src/ nunca se
// importam, então estes valores são copiados à mão e só um confronto de
// arquivos percebe quando um lado muda sozinho.
console.log("\nconstantes duplicadas entre server/ e src/");
const conversor = await ler("src/components/Conversor.jsx");
for (const [nome, valorServidor] of Object.entries({
  BUSHEL_POR_SACA: util.BUSHEL_POR_SACA,
  TON_POR_SACA: util.TON_POR_SACA,
})) {
  const valorCliente = constanteDoCliente(conversor, nome);
  if (valorCliente == null) falhar(`${nome} não encontrado (ou não numérico) em Conversor.jsx`);
  else {
    // Tolerância mínima: os dois lados escrevem a mesma conta, não o mesmo literal.
    conferir(
      Math.abs(valorCliente - valorServidor) < 1e-9,
      `${nome}: util.js ${valorServidor} = Conversor.jsx ${valorCliente}`
    );
  }
}

console.log(falhas === 0 ? "\ntudo certo\n" : `\n${falhas} verificação(ões) falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
