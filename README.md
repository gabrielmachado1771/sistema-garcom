# Sistema Garçom

Sistema de atendimento para restaurante feito em **React**, **Vite** e **Tailwind CSS**, desenvolvido como trabalho da faculdade (Engenharia de Software, Unilasalle).

**Demonstração:** https://gabrielmachado1771.github.io/sistema-garcom/

## Como funciona

O sistema tem três telas que compartilham o mesmo estado:

- **Garçom:** abre uma das 10 mesas, adiciona e remove itens do cardápio por categoria, escreve observações e envia o pedido para a cozinha.
- **Cozinha:** vê os pedidos que estão aguardando e marca cada um como pronto, o que aparece na hora para o garçom.
- **Caixa:** lista as mesas com conta aberta, fecha a conta escolhendo dinheiro, Pix, crédito ou débito e guarda o histórico de vendas.

## Tecnologias

- React 19 (componentes de função e `useState`)
- Vite
- Tailwind CSS 4

## Rodando localmente

```bash
npm install
npm run dev
```

## Autor

Gabriel Machado de Oliveira · [LinkedIn](https://www.linkedin.com/in/gabriel-machado-de-oliveira-173954356) · [Portfólio](https://gabrielmachado1771.github.io/)
