# 🌱 Soja Tracker — Preços da Soja no Brasil

App web (PWA) para acompanhar os preços da soja no mercado brasileiro — mercado
**físico**, de **exportação** e o **complexo farelo/óleo** — todo em português.
Espelha a arquitetura do Café Tracker / ETF Tracker.

Reúne, a partir de **fontes públicas e gratuitas**, o essencial que antes exigia
um terminal Bloomberg:

- **Indicadores CEPEA/ESALQ** — Soja Paranaguá (ESALQ/B3) e Paraná (R$/saca de 60 kg)
- **Futuros das bolsas** — Soja CBOT (Chicago), Soja CME/B3 (US$/saca), Farelo e Óleo (Chicago)
- **Prêmio de exportação** — Paranaguá (US$/bushel sobre Chicago)
- **Paridade de exportação** — CBOT + prêmio convertidos em R$/saca, e o diferencial vs. o interno
- **Mercado físico regional** — preços por praça/cooperativa (RS, PR, MS, IMEA/MT…) e farelo interno (R$/t)
- **Câmbio oficial** — USD/BRL e EUR/BRL (PTAX, Banco Central)
- **Mercado** — clima (chuva 30d vs. média histórica nas regiões produtoras: MT, GO, MS, PR, RS,
  MATOPIBA), margem de esmagamento (crush CBOT), tabela de índices (1D/30D/12M) e gráficos
  comparativos (Dólar×CBOT, CBOT×CEPEA)
- **Conversor** de unidades (US$/bushel ↔ US$/saca ↔ R$/saca ↔ R$/t)
- **Alertas** de preço (salvos no próprio aparelho)

## Fontes de dados (todas gratuitas)

| Dado | Fonte |
|------|-------|
| CEPEA, futuros CBOT/B3, prêmio, físico regional | [Notícias Agrícolas](https://www.noticiasagricolas.com.br/cotacoes/soja) (que republica CEPEA/ESALQ, CME, B3, IMEA) |
| Histórico de CBOT soja/farelo/óleo (gráficos) | Yahoo Finance (`ZS=F`, `ZM=F`, `ZL=F`) |
| Câmbio USD/BRL e EUR/BRL | [Banco Central do Brasil (PTAX/SGS)](https://dadosabertos.bcb.gov.br) |
| Clima (chuva por região) | [Open-Meteo](https://open-meteo.com) (Archive API, sem chave) |
| Reforço dos indicadores CEPEA | Widget público do [CEPEA](https://www.cepea.org.br), lido ao vivo no seu computador e por coleta agendada (GitHub Actions) em produção |

> **Unidades:** 1 saca = 60 kg ≈ 2,2046 bushels de soja. Soja em grão é
> normalizada para **R$/saca**; farelo e óleo, para **R$/tonelada**.

## Como rodar

Requisitos: **Node.js 18+**.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` (a porta aparece no terminal). O servidor já sobe
com `host` ativo, então você também pode abrir no **celular pela mesma rede
Wi‑Fi**, no endereço `http://SEU_IP_LOCAL:5173` que o Vite mostra em "Network".

Para instalar como app no celular: abra no Chrome/Safari e use
**"Adicionar à tela de início"** (é um PWA).

## Como compartilhar (deploy na Vercel)

O app usa pequenas funções de servidor (pasta `api/`) porque as fontes não
permitem acesso direto do navegador. A [Vercel](https://vercel.com) roda tudo de
graça:

1. Crie uma conta na Vercel e instale a CLI: `npm i -g vercel`
2. Nesta pasta, rode: `vercel` (aceite os padrões — o framework Vite é detectado)
3. Para publicar a versão final: `vercel --prod`
4. Compartilhe o link `https://...vercel.app`. 🎉

## Estrutura

```
api/            funções serverless (cotacoes, detalhe, cambio, mercado, clima)
server/         camada de dados
  catalogo.js       indicadores fixos (futuros + CEPEA + prêmio)
  datalayer.js      fachada que combina as fontes e normaliza p/ R$/saca e R$/t
  providers/        noticiasagricolas, yahoo, bcb, cepea, openmeteo
  store.js          histórico "que cresce" (snapshots diários)
  util.js           conversões de unidade e parsing pt-BR
src/            app React (componentes em português)
public/         manifest e service worker (PWA)
```

## Limitações honestas

- **Histórico real** existe para os futuros de Chicago (Yahoo) e o câmbio (BCB).
  Para CEPEA, prêmio e mercado físico **não há API gratuita de série histórica**,
  então o app guarda um **snapshot por dia** e o gráfico desses indicadores
  **cresce com o tempo** (começa curto). Na Vercel esses snapshots ficam em
  `/tmp` (efêmero) — a exceção são os indicadores CEPEA, cuja série é acumulada
  no repositório pelo job de coleta (ver abaixo) e por isso **persiste**.
- **O site do CEPEA bloqueia servidores.** O `cepea.org.br` está atrás de um
  desafio anti-bot da Cloudflare que responde **403** a qualquer servidor (nas
  funções da Vercel, em qualquer região), mas responde normalmente a partir dos
  runners do GitHub. Como aqui o CEPEA é o **fallback** dos indicadores (a fonte
  primária é a Notícias Agrícolas), sem isso o app ficaria sem rede de proteção
  em produção. Por isso o workflow `.github/workflows/coletar-cepea.yml` roda
  duas vezes por dia e versiona o resultado em `server/cepea-cache.json`; o app
  lê a fonte ao vivo em desenvolvimento e cai nesse arquivo em produção (a tela
  do indicador avisa quando o valor veio do cache). Se o repositório ficar 60
  dias sem atividade, o GitHub suspende workflows agendados — basta reativar na
  aba Actions.
- A leitura da Notícias Agrícolas é **melhor esforço**: se eles mudarem o HTML,
  o arquivo `server/providers/noticiasagricolas.js` precisa de um ajuste.
- A "paridade de exportação" e o "diferencial" são **aproximações didáticas** —
  não consideram custos portuários, frete e impostos.

## Aviso

Dados de fontes públicas, possivelmente com atraso. **Uso informativo — não é
recomendação de investimento.**
