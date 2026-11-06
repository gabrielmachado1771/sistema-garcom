# Sistema Garçom 🍽

Sistema de restaurante com três ambientes: **Garçom**, **Cozinha** e **Caixa**.
Feito com React 19 + Vite + Tailwind CSS 4.

🌐 **Acesse online:** https://gabrielmachado1771.github.io/sistema-garcom/
(publicado automaticamente pelo GitHub Pages a cada push na `main`)

## Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a versão de produção em dist/
npm run lint
```

## Acesso e funções

Cada pessoa entra escolhendo seu nome e digitando um **PIN de 4 números**.

| Função | Acessa |
|---|---|
| 🛡️ Administrador | Tudo: painel, garçom, cozinha, caixa e equipe |
| 📝 Garçom | Só mesas e pedidos |
| 👨‍🍳 Cozinha | Só a fila de pedidos |
| 💰 Caixa | Só contas, pagamentos e histórico |

**Primeiro acesso:** entre como *Administrador* com o PIN `1234`, troque o PIN e cadastre a equipe na aba **Equipe**.

O login vale por aba: dá para ter o garçom numa aba e a cozinha em outra, cada uma com seu usuário.

> ⚠️ Os PINs ficam no navegador (com hash). Serve para uso acadêmico/demonstração; num sistema real a autenticação precisa ficar num servidor.

## Funcionalidades

**Garçom**
- Mapa de mesas com status (livre, ocupada, em preparo, pronto para servir)
- Aviso "Prontos para servir" com botão *Servido*
- Cardápio com busca (ignora acentos) e filtro por categoria
- Pedido montado em rascunho e enviado à cozinha em rodadas (comandas) — dá para pedir mais itens depois
- Observação por pedido e cancelamento de pedido enquanto ainda está em preparo

**Cozinha**
- Fila de pedidos do mais antigo para o mais novo, com tempo decorrido
- Destaque em vermelho para pedidos com mais de 20 minutos
- Marcar como pronto / desfazer

**Caixa**
- Contas abertas e valor total em aberto
- Taxa de serviço de 10% (opcional), divisão da conta por pessoas
- Pagamento em dinheiro com cálculo de troco
- Histórico com total do dia, ticket médio e total por forma de pagamento; fechamento de caixa

## Detalhes técnicos

- Os dados ficam salvos no `localStorage` — recarregar a página não perde nada.
- Abas abertas no mesmo navegador são sincronizadas: deixe a Cozinha numa aba e o Garçom em outra.
- Navegação pela URL (`#/garcom/3`, `#/cozinha`, `#/caixa/historico`), então o botão voltar do navegador funciona.

## Estrutura

```
src/
  App.jsx                    rotas
  store/regras.js            regras de negócio (reducer e cálculos, sem React)
  store/RestauranteProvider  estado global + persistência + sincronização entre abas
  pages/                     Login, Painel, Equipe, Garcom, Mesa, Cozinha, Caixa, Conta, Historico
  components/ui.jsx          componentes visuais reutilizáveis
  data/cardapio.js           produtos e categorias
  utils/format.js            formatação de moeda e horários
```
