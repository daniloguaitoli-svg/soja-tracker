// scripts/fumaca.mjs — teste de fumaça: monta o app DE VERDADE e abre cada aba.
//
// POR QUE ISTO EXISTE: nem `build` nem `verificar` renderizam um componente
// React. O `vite build` só empacota — código que estoura ao rodar empacota
// perfeitamente. O `verificar` só analisa `server/`. Sobra um buraco do tamanho
// de toda a pasta `src/components/`.
//
// Não é hipótese. O Tesouro Tracker, projeto irmão de mesma arquitetura, mandou
// uma tela quebrada para produção exatamente por aí: a declaração
// `useState("real")` de uma variável sumiu numa edição, o JSX seguiu usando, e a
// aba morria com ReferenceError assim que alguém a abria. Build verde,
// verificar verde, produção quebrada. Só apareceu abrindo o app no navegador.
// O mesmo buraco existe aqui, nas mesmas cinco telas.
//
// POR QUE MONTAR COM DADOS, E NÃO SÓ RENDERIZAR: naquele bug o erro estava
// DEPOIS dos early returns de carregamento (`if (!dados) return <Skeletons/>`).
// Renderizar sem dados para no primeiro return e nunca chega no corpo real da
// tela. Renderizar no servidor também não serve: `useEffect` não roda em SSR,
// então o estado nunca sai de `null`. É por isso que aqui tem DOM (jsdom) e as
// respostas de `/api` vêm preenchidas — só assim o componente executa inteiro.
//
// POR QUE O DATALAYER DE VERDADE, E NÃO UM FIXTURE: fixture congela o formato e
// envelhece calado. Chamando `server/datalayer.js` o teste também cobre o
// contrato servidor→cliente: se o payload mudar de forma e a tela não
// acompanhar, quebra aqui. Custa menos de um segundo.
//
// POR QUE NÃO TEM FRAMEWORK DE TESTE: a casa não tem um (ver CLAUDE.md), e não
// é preciso — isto é um script Node que sai 0 ou 1, igual ao `verificar`.

import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// As abas na ordem em que App.jsx as declara. Se uma aba nova entrar lá e não
// aqui, o teste avisa em vez de deixar a tela nova sem cobertura nenhuma.
const ABAS_ESPERADAS = ["Painel", "Cotações", "Mercado", "Conversor", "Alertas"];

const falhas = [];
const relato = [];

// ---------- 1. Os payloads, montados pelo servidor de verdade ----------

const datalayer = await import(join(RAIZ, "server/datalayer.js"));

const ROTAS = {
  "/api/cotacoes": datalayer.getCotacoes,
  "/api/mercado": datalayer.getMercado,
  "/api/cambio": datalayer.getCambio,
  "/api/clima": datalayer.getClima,
};

// Guarda { ok, corpo } e não só o corpo, porque a FORMA DA FALHA importa.
// Uma fonte fora do ar vira, em produção, um 502 com `{ error }` (é o que os
// `api/*.js` fazem), e a tela trata isso no `.catch` do fetch. Devolver aqui um
// 200 com corpo vazio seria uma falha que produção nunca produz — a tela leria
// `undefined.map` e o teste acusaria um defeito inexistente. Já aconteceu:
// a primeira versão deste script reprovou a aba Mercado por isso.
const payloads = {};
for (const [rota, fn] of Object.entries(ROTAS)) {
  if (typeof fn !== "function") continue;
  try {
    payloads[rota] = { ok: true, corpo: await fn() };
  } catch (e) {
    relato.push(`  aviso  ${rota} fora do ar (${e.message.slice(0, 50)}) — servido como 502, igual à produção`);
    payloads[rota] = { ok: false, corpo: { error: e.message } };
  }
}

// ---------- 2. Um DOM, e um fetch que serve aqueles payloads ----------

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// `defineProperty` e não atribuição: o Node 22 já traz um `navigator` global
// que só tem getter, e atribuir nele estoura TypeError.
for (const chave of [
  "window", "document", "navigator", "location", "history", "localStorage",
  "sessionStorage", "HTMLElement", "Element", "Node", "Event", "CustomEvent",
  "MutationObserver", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame", "SVGElement",
]) {
  if (dom.window[chave] === undefined) continue;
  Object.defineProperty(globalThis, chave, {
    value: dom.window[chave],
    writable: true,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

globalThis.fetch = async (url) => {
  const caminho = String(url).split("?")[0];
  const r = payloads[caminho];
  if (r === undefined) {
    // Endpoint que a tela chama e o teste não conhece: vale saber.
    falhas.push(`fetch inesperado: ${url}`);
    return { ok: false, status: 404, json: async () => ({ error: "rota não mapeada no teste" }) };
  }
  // Espelha o que o `api/<rota>.js` devolveria: 200 com o payload, ou 502 com
  // `{ error }`. Assim o caminho de erro da tela é exercitado de verdade.
  return { ok: r.ok, status: r.ok ? 200 : 502, json: async () => r.corpo };
};

// Erros que escapam do React (efeito assíncrono, handler) caem aqui.
const errosSoltos = [];
dom.window.addEventListener("error", (e) => errosSoltos.push(e.error?.stack || e.message));
process.on("unhandledRejection", (e) => errosSoltos.push(`unhandledRejection: ${e?.message || e}`));

const erroOriginal = console.error;
console.error = (...args) => {
  const txt = String(args[0] ?? "");
  if (txt.includes("not wrapped in act")) return;
  erroOriginal(...args);
};

// ---------- 3. O App, transpilado pelo próprio vite ----------

// `ssrLoadModule` faz o JSX virar JS usando a config do projeto — sem ela seria
// preciso um transpilador só para o teste, e aí o teste exercitaria uma build
// diferente da que vai para produção.
const vite = await createServer({
  root: RAIZ,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

let React, createRoot, App;
try {
  // React entra por import normal, não por `ssrLoadModule`: ele é CommonJS e o
  // avaliador SSR do vite estoura com "module is not defined". O vite
  // externaliza dependências de node_modules no SSR, então o App carregado
  // abaixo enxerga ESTA mesma instância — se fossem duas, todo hook quebraria.
  React = (await import("react")).default;
  createRoot = (await import("react-dom/client")).createRoot;
  App = (await vite.ssrLoadModule("/src/App.jsx")).default;
} catch (e) {
  console.error(`\nFALHA ao carregar o app: ${e.message}\n`);
  await vite.close();
  process.exit(1);
}

// Fronteira de erro: sem ela um erro de render sobe e derruba o processo sem
// dizer QUAL aba quebrou. Classe porque a API do React exige — a regra de "só
// componente de função" vale para `src/`, não para o arnês de teste.
class Fronteira extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }
  static getDerivedStateFromError(erro) {
    return { erro };
  }
  render() {
    return this.state.erro ? null : this.props.children;
  }
}

// Espera no RELÓGIO, não em voltas de microtask.
//
// Um laço de `setTimeout(0)` esvazia a fila de microtasks, mas não espera nada
// que leve tempo de verdade — um fetch com latência, uma cadeia de promessas.
// Hoje o stub responde na hora e um laço bastaria; no dia em que não bastar, a
// tela seria lida ainda carregando e o teste acusaria "renderizou quase nada"
// num componente perfeito. (Foi exatamente esse o erro na versão do irmão ETF
// Tracker, onde o mock atrasa 250ms de propósito.)
//
// O sinal de "terminou" aqui é o próprio tamanho do texto: `Skeletons` não
// renderiza texto nenhum e `Loading` renderiza 21 caracteres, ambos abaixo do
// piso de 40 — então texto acima do piso E parado significa tela pronta.
const tique = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarAssentar(ler, { piso = 40, teto = 5000, passo = 25, repeticoes = 3 } = {}) {
  const inicio = Date.now();
  let anterior = null;
  let parado = 0;
  while (Date.now() - inicio < teto) {
    await tique(passo);
    const agora = ler();
    if (agora.length < piso) {
      parado = 0;
      anterior = agora;
      continue;
    }
    if (agora === anterior) {
      if (++parado >= repeticoes) return agora;
    } else {
      parado = 0;
      anterior = agora;
    }
  }
  return ler();
}

// Conteúdo da aba: o <main>, não o container inteiro (ver o porquê abaixo).
const textoDaAba = (container) => {
  const conteudo = container.querySelector("main") || container;
  return conteudo.textContent.replace(/\s+/g, " ").trim();
};

// ---------- 4. Abrir cada aba, uma montagem limpa por aba ----------

// Montagem limpa por aba para que uma tela quebrada não contamine a próxima: a
// fronteira, ao pegar um erro, passa a renderizar nada, e um mount só daria
// "todas as abas seguintes falharam" a partir da primeira quebra.
async function abrirAba(nome) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const antes = errosSoltos.length;
  const capturados = [];
  const raiz = createRoot(container, {
    onUncaughtError: (e) => capturados.push(e),
    onCaughtError: (e) => capturados.push(e),
  });

  try {
    raiz.render(React.createElement(Fronteira, null, React.createElement(App)));
    // Espera a moldura aparecer (ou um erro de montagem estourar).
    await esperarAssentar(() => (container.querySelector('[role="tab"]') ? "moldura" : ""), { piso: 1, teto: 5000 });

    // Erro na montagem inicial ANTES de procurar as abas. A aba padrão renderiza
    // junto com a moldura, então se ela quebrar a fronteira apaga a árvore
    // inteira e o `querySelectorAll` abaixo não acha nada. Reportar "a moldura
    // não montou" nesse caso mandaria quem lê investigar o lugar errado — o
    // defeito está na tela padrão, e a mensagem tem de dizer isso.
    const naMontagem = [...capturados, ...errosSoltos.slice(antes)];
    if (naMontagem.length) {
      const e = naMontagem[0];
      return { ok: false, motivo: `quebrou ao montar o app: ${String(e?.message || e).split("\n")[0]}` };
    }

    const botoes = [...container.querySelectorAll('[role="tab"]')];
    if (!botoes.length) return { ok: false, motivo: "nenhuma aba encontrada (a moldura não montou)" };

    const alvo = botoes.find((b) => b.textContent.trim() === nome);
    if (!alvo) return { ok: false, motivo: `aba "${nome}" não existe na moldura` };

    alvo.click();
    const texto = await esperarAssentar(() => textoDaAba(container));

    const novos = errosSoltos.slice(antes);
    if (capturados.length || novos.length) {
      const e = capturados[0] || novos[0];
      return { ok: false, motivo: String(e?.message || e).split("\n")[0] };
    }

    // Tela vazia também é defeito. `textoDaAba` mede o <main>, NÃO o container
    // inteiro: a moldura (marca + tira de abas) sozinha já passa de 70
    // caracteres, então um piso medido no container aprovaria uma aba cujo
    // corpo não renderizou nada.
    if (texto.length < 40) {
      return { ok: false, motivo: `o corpo da aba renderizou quase nada (${texto.length} chars)` };
    }

    return { ok: true, chars: texto.length };
  } catch (e) {
    return { ok: false, motivo: String(e.message).split("\n")[0] };
  } finally {
    try {
      raiz.unmount();
    } catch {}
    container.remove();
  }
}

console.log("\nteste de fumaça — monta o app e abre cada aba\n");
if (relato.length) console.log(relato.join("\n"));

for (const aba of ABAS_ESPERADAS) {
  const r = await abrirAba(aba);
  if (r.ok) {
    console.log(`  ok     ${aba.padEnd(11)} renderizou (${r.chars} chars)`);
  } else {
    console.log(`  FALHA  ${aba.padEnd(11)} ${r.motivo}`);
    falhas.push(`${aba}: ${r.motivo}`);
  }
}

await vite.close();
console.error = erroOriginal;

if (falhas.length) {
  console.log(`\n${falhas.length} falha(s):`);
  for (const f of falhas) console.log(`  - ${f}`);
  console.log("");
  process.exit(1);
}

console.log("\ntodas as abas montaram\n");
process.exit(0);
