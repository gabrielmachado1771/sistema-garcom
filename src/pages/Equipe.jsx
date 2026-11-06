import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { FUNCOES, totalAdminsAtivos } from "../store/regras";
import { PIN_TAMANHO } from "../utils/pin";
import { classeInput } from "../utils/estilos";
import { dataHora, plural } from "../utils/format";
import { Avatar, Botao, Cabecalho, Campo, Cartao, Etiqueta, Modal, Pagina, Vazio } from "../components/ui";

const TODAS = "todas";
const soDigitos = (v) => v.replace(/\D/g, "").slice(0, PIN_TAMANHO);

function FormFuncionario({ inicial, funcionarios, onSalvar, onCancelar, bloquearFuncao }) {
  const editando = !!inicial;
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [funcao, setFuncao] = useState(inicial?.funcao ?? "garcom");
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const nomeLimpo = nome.trim();
  const nomeRepetido = funcionarios.some(
    (f) => f.id !== inicial?.id && f.nome.trim().toLowerCase() === nomeLimpo.toLowerCase()
  );
  const erros = {
    nome: !nomeLimpo ? "Informe o nome." : nomeRepetido ? "Já existe alguém com esse nome." : "",
    pin:
      !editando || pin
        ? pin.length !== PIN_TAMANHO
          ? `O PIN precisa ter ${PIN_TAMANHO} números.`
          : ""
        : "",
    confirmacao: (pin || !editando) && confirmacao !== pin ? "Os PINs não conferem." : "",
  };
  const valido = !erros.nome && !erros.pin && !erros.confirmacao;

  function enviar(e) {
    e.preventDefault();
    setTentouSalvar(true);
    if (!valido) return;
    onSalvar({ nome: nomeLimpo, funcao, ...(pin ? { pin } : {}) });
  }

  const mostrarErro = (campo) => (tentouSalvar ? erros[campo] : "");

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo rotulo="Nome" erro={mostrarErro("nome")}>
        <input
          autoFocus
          className={classeInput}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Maria Souza"
          maxLength={40}
        />
      </Campo>

      <fieldset>
        <legend className="text-xs font-semibold text-zinc-400 mb-1">Função</legend>
        {bloquearFuncao && (
          <p className="text-xs text-zinc-500 mb-2">Você não pode alterar a sua própria função.</p>
        )}
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {Object.entries(FUNCOES).map(([id, f]) => (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={funcao === id}
              disabled={bloquearFuncao && id !== funcao}
              onClick={() => setFuncao(id)}
              className={`p-3 rounded-xl text-left border transition disabled:opacity-30 ${
                funcao === id
                  ? "border-orange-500 bg-orange-500/10"
                  : "border-zinc-800 bg-zinc-800/50 hover:border-zinc-600"
              }`}
            >
              <span className="block font-semibold text-sm">
                {f.emoji} {f.label}
              </span>
              <span className="block text-[11px] text-zinc-400 leading-snug mt-0.5">{f.descricao}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo={editando ? "Novo PIN" : "PIN"}
          erro={mostrarErro("pin")}
          dica={editando ? "Em branco = manter" : `${PIN_TAMANHO} números`}
        >
          <input
            className={`${classeInput} tracking-[0.5em] text-center text-lg`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(soDigitos(e.target.value))}
            placeholder="••••"
          />
        </Campo>
        <Campo rotulo="Confirmar PIN" erro={mostrarErro("confirmacao")}>
          <input
            className={`${classeInput} tracking-[0.5em] text-center text-lg`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(soDigitos(e.target.value))}
            placeholder="••••"
          />
        </Campo>
      </div>

      <div className="flex gap-2 pt-2">
        <Botao className="flex-1 py-3" onClick={onCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" className="flex-1 py-3">
          {editando ? "Salvar" : "Cadastrar"}
        </Botao>
      </div>
    </form>
  );
}

export default function Equipe() {
  const { funcionarios, usuario, criarFuncionario, editarFuncionario, removerFuncionario } =
    useRestaurante();
  const aviso = useAviso();
  const [filtro, setFiltro] = useState(TODAS);
  const [modal, setModal] = useState(null); // null | { tipo: "novo" } | { tipo: "editar", id }

  const admins = totalAdminsAtivos(funcionarios);
  const lista = funcionarios
    .filter((f) => filtro === TODAS || f.funcao === filtro)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
  const emEdicao = modal?.tipo === "editar" ? funcionarios.find((f) => f.id === modal.id) : null;

  const ehUltimoAdmin = (f) => f.funcao === "admin" && f.ativo && admins <= 1;

  function salvar(dados) {
    if (emEdicao) {
      if (ehUltimoAdmin(emEdicao) && dados.funcao !== "admin") {
        aviso("O sistema precisa de pelo menos um administrador.", { tipo: "erro" });
        return;
      }
      editarFuncionario(emEdicao.id, dados);
      aviso(`${dados.nome} atualizado.`);
    } else {
      criarFuncionario(dados);
      aviso(`${dados.nome} cadastrado como ${FUNCOES[dados.funcao].label}.`);
    }
    setModal(null);
  }

  function alternarAtivo(f) {
    if (f.ativo && ehUltimoAdmin(f)) {
      aviso("Não dá para desativar o único administrador.", { tipo: "erro" });
      return;
    }
    editarFuncionario(f.id, { ativo: !f.ativo });
    aviso(f.ativo ? `${f.nome} desativado — não consegue mais entrar.` : `${f.nome} reativado.`, {
      tipo: f.ativo ? "info" : "sucesso",
    });
  }

  function excluir(f) {
    if (ehUltimoAdmin(f)) {
      aviso("Não dá para excluir o único administrador.", { tipo: "erro" });
      return;
    }
    if (window.confirm(`Excluir ${f.nome} definitivamente?`)) {
      removerFuncionario(f.id);
      aviso(`${f.nome} excluído.`, { tipo: "info" });
    }
  }

  const contagem = (id) => funcionarios.filter((f) => f.funcao === id).length;

  return (
    <Pagina largura="max-w-3xl">
      <Cabecalho
        titulo="Equipe"
        subtitulo={`${plural(funcionarios.filter((f) => f.ativo).length, "funcionário ativo", "funcionários ativos")}`}
      >
        <Botao variante="primario" className="px-4 py-2 text-sm" onClick={() => setModal({ tipo: "novo" })}>
          + Novo funcionário
        </Botao>
      </Cabecalho>

      {usuario.pinPadrao && (
        <Cartao className="border-orange-500/40 bg-orange-500/10 flex items-center justify-between gap-3">
          <p className="text-sm">
            🔐 Você ainda usa o PIN padrão. <span className="text-zinc-400">Troque para proteger o acesso de administrador.</span>
          </p>
          <Botao
            variante="primario"
            className="px-3 py-2 text-sm shrink-0"
            onClick={() => setModal({ tipo: "editar", id: usuario.id })}
          >
            Trocar PIN
          </Botao>
        </Cartao>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {[TODAS, ...Object.keys(FUNCOES)].map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => setFiltro(id)}
            aria-pressed={filtro === id}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
              filtro === id ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {id === TODAS ? `Todos (${funcionarios.length})` : `${FUNCOES[id].emoji} ${FUNCOES[id].label} (${contagem(id)})`}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Vazio icone="👥">
          Ninguém nesta função ainda.{" "}
          <button type="button" className="text-orange-400 underline" onClick={() => setModal({ tipo: "novo" })}>
            Cadastrar agora
          </button>
        </Vazio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((f) => {
            const souEu = f.id === usuario.id;
            return (
              <Cartao key={f.id} className={`flex flex-col gap-3 ${f.ativo ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-3">
                  <Avatar funcionario={f} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate flex items-center gap-2">
                      {f.nome}
                      {souEu && <Etiqueta cor="laranja">Você</Etiqueta>}
                      {!f.ativo && <Etiqueta>Inativo</Etiqueta>}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {FUNCOES[f.funcao].emoji} {FUNCOES[f.funcao].label}
                    </p>
                    <p className="text-[11px] text-zinc-600">desde {dataHora(f.criadoEm)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Botao className="flex-1 py-2 text-sm" onClick={() => setModal({ tipo: "editar", id: f.id })}>
                    Editar
                  </Botao>
                  {!souEu && (
                    <>
                      <Botao className="flex-1 py-2 text-sm" onClick={() => alternarAtivo(f)}>
                        {f.ativo ? "Desativar" : "Reativar"}
                      </Botao>
                      <Botao
                        variante="fantasma"
                        className="px-3 py-2 text-sm hover:text-red-400"
                        aria-label={`Excluir ${f.nome}`}
                        onClick={() => excluir(f)}
                      >
                        🗑
                      </Botao>
                    </>
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      <Modal
        aberto={!!modal}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo funcionário"}
        onFechar={() => setModal(null)}
      >
        <FormFuncionario
          key={modal?.id ?? "novo"}
          inicial={emEdicao}
          funcionarios={funcionarios}
          bloquearFuncao={emEdicao?.id === usuario.id}
          onSalvar={salvar}
          onCancelar={() => setModal(null)}
        />
      </Modal>
    </Pagina>
  );
}
