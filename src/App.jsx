import { useState, useEffect } from "react";
import Home from "./pages/home";
import Garcom from "./pages/Garcom";
import Cozinha from "./pages/Cozinha";
import Caixa from "./pages/caixa";

const NUM_MESAS = 10;

function criarMesas() {
  return Array.from({ length: NUM_MESAS }, (_, i) => ({
    id: i + 1,
    numero: i + 1,
    status: "livre",
    total: 0,
    pedidos: [],
    observacao: "",
    enviadoCozinha: false,
    concluidoCozinha: false,
    horaPedido: null,
  }));
}

export default function App() {
  const [tela, setTela] = useState("home");
  const [mesas, setMesas] = useState(criarMesas);
  const [mesaSelecionada, setMesaSelecionada] = useState(null);
  const [historico, setHistorico] = useState([]);

  const mesaAtual = mesas.find((m) => m.id === mesaSelecionada);

  function abrirMesa(id) {
    setMesas((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "ocupada" } : m))
    );
    setMesaSelecionada(id);
  }

  function adicionarItem(produto) {
    setMesas((prev) =>
      prev.map((m) => {
        if (m.id !== mesaSelecionada) return m;

        const existente = m.pedidos.find((i) => i.nome === produto.nome);
        let novosPedidos;

        if (existente) {
          novosPedidos = m.pedidos.map((i) =>
            i.nome === produto.nome ? { ...i, qtd: i.qtd + 1 } : i
          );
        } else {
          novosPedidos = [
            ...m.pedidos,
            { id: Date.now(), nome: produto.nome, preco: produto.preco, qtd: 1 },
          ];
        }

        const total = novosPedidos.reduce((acc, i) => acc + i.preco * i.qtd, 0);

        return { ...m, pedidos: novosPedidos, total };
      })
    );
  }

  function removerItem(nome) {
    setMesas((prev) =>
      prev.map((m) => {
        if (m.id !== mesaSelecionada) return m;

        const novosPedidos = m.pedidos
          .map((i) => (i.nome === nome ? { ...i, qtd: i.qtd - 1 } : i))
          .filter((i) => i.qtd > 0);

        const total = novosPedidos.reduce((acc, i) => acc + i.preco * i.qtd, 0);

        return { ...m, pedidos: novosPedidos, total };
      })
    );
  }

  function setObservacao(obs) {
    setMesas((prev) =>
      prev.map((m) =>
        m.id === mesaSelecionada ? { ...m, observacao: obs } : m
      )
    );
  }

  function enviarParaCozinha() {
    setMesas((prev) =>
      prev.map((m) => {
        if (m.id !== mesaSelecionada) return m;
        return {
          ...m,
          enviadoCozinha: true,
          concluidoCozinha: false,
          horaPedido: new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      })
    );
  }

  function concluirPedidoCozinha(idMesa) {
    setMesas((prev) =>
      prev.map((m) =>
        m.id === idMesa ? { ...m, concluidoCozinha: true } : m
      )
    );
  }

  function finalizarConta(idMesa, formaPagamento) {
    const mesa = mesas.find((m) => m.id === idMesa);
    if (!mesa) return;

    setHistorico((prev) => [
      {
        id: Date.now(),
        mesa: mesa.numero,
        pedidos: [...mesa.pedidos],
        total: mesa.total,
        formaPagamento,
        data: new Date().toLocaleString("pt-BR"),
      },
      ...prev,
    ]);

    setMesas((prev) =>
      prev.map((m) =>
        m.id === idMesa
          ? {
              ...m,
              status: "livre",
              total: 0,
              pedidos: [],
              observacao: "",
              enviadoCozinha: false,
              concluidoCozinha: false,
              horaPedido: null,
            }
          : m
      )
    );
  }

  if (tela === "home") {
    return <Home setTela={setTela} />;
  }

  if (tela === "cozinha") {
    return (
      <Cozinha
        mesas={mesas}
        concluirPedidoCozinha={concluirPedidoCozinha}
        voltarHome={() => setTela("home")}
      />
    );
  }

  if (tela === "caixa") {
    return (
      <Caixa
        mesas={mesas}
        finalizarConta={finalizarConta}
        historico={historico}
        voltarHome={() => setTela("home")}
      />
    );
  }

  return (
    <Garcom
      mesas={mesas}
      mesaSelecionada={mesaSelecionada}
      setMesaSelecionada={setMesaSelecionada}
      abrirMesa={abrirMesa}
      adicionarItem={adicionarItem}
      removerItem={removerItem}
      enviarParaCozinha={enviarParaCozinha}
      setObservacao={setObservacao}
      voltarHome={() => {
        setMesaSelecionada(null);
        setTela("home");
      }}
    />
  );
}
