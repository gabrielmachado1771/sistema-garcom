import { useState } from "react";
import { rpcAdmin, traduzirErroAdmin } from "../store/supabaseAdmin";
import { useAviso } from "../store/contexto";
import { FUNCOES } from "../store/regras";
import { linkDoRestaurante } from "../utils/codigo";
import { classeInput } from "../utils/estilos";
import { dataHora, moeda, tempoDecorrido } from "../utils/format";
import { Botao, BotaoVoltar, Cabecalho, Campo, Cartao, Etiqueta, Modal, Pagina, TituloSecao, Vazio } from "../components/ui";
import useDadosAdmin from "./useDadosAdmin";
import { ACOES, PLANOS, TIPOS_ATOR, descreverDetalhes, gerarPin } from "./textos";

// Onde o site dos restaurantes guarda a sessão e o restaurante (ver RestauranteProvider).
const CHAVE_SESSAO = "sistema-garcom:token";
const CHAVE_RESTAURANTE = "sistema-garcom:restaurante";

function FormEditar({ empresa, onSalvo, onFechar }) {
  const aviso = useAviso();
  const [d, setD] = useState({
    nome: empresa.nome,
    slug: empresa.slug,
    cnpj: empresa.cnpj ?? "",
    plano: empresa.plano,
    taxa: String(Math.round(empresa.taxaServico * 1000) / 10),
  });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const mudar = (k, v) => setD((x) => ({ ...x, [k]: v }));

  async function salvar(e) {
    e.preventDefault();
    const taxa = Number(d.taxa.replace(",", "."));
    if (!(taxa >= 0 && taxa <= 30)) return setErro("A taxa precisa ficar entre 0% e 30%.");
    if (d.slug !== empresa.slug && !window.confirm("Mudar o código muda o link do restaurante. Os aparelhos da equipe vão pedir o código novo. Continuar?")) return;
    setEnviando(true);
    try {
      await rpcAdmin("admin_editar_empresa", {
        p_id: empresa.id,
        p_nome: d.nome.trim(),
        p_slug: d.slug,
        p_cnpj: d.cnpj,
        p_plano: d.plano,
        p_taxa: taxa / 100,
      });
      aviso("Restaurante atualizado.");
      onSalvo();
    } catch (err) {
      setErro(traduzirErroAdmin(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal aberto titulo="Editar restaurante" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome">
          <input maxLength={60} value={d.nome} onChange={(e) => mudar("nome", e.target.value)} className={classeInput} />
        </Campo>
        <Campo rotulo="Código (link)">
          <input
            maxLength={40}
            value={d.slug}
            onChange={(e) => mudar("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className={classeInput}
          />
        </Campo>
        <Campo rotulo="CNPJ">
          <input value={d.cnpj} onChange={(e) => mudar("cnpj", e.target.value)} className={classeInput} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Plano">
            <select value={d.plano} onChange={(e) => mudar("plano", e.target.value)} className={classeInput}>
              {PLANOS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Taxa de serviço (%)">
            <input inputMode="decimal" value={d.taxa} onChange={(e) => mudar("taxa", e.target.value)} className={classeInput} />
          </Campo>
        </div>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <Botao type="submit" variante="primario" className="w-full py-3" disabled={enviando}>
          Salvar
        </Botao>
      </form>
    </Modal>
  );
}

export function LinhaLog({ l, mostrarEmpresa }) {
  const tipo = TIPOS_ATOR[l.atorTipo] ?? TIPOS_ATOR.funcionario;
  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{ACOES[l.acao] ?? l.acao}</span>
        <Etiqueta cor={tipo.cor}>{tipo.label}</Etiqueta>
      </div>
      <p className="text-xs text-zinc-400">
        {dataHora(l.quando)} · {l.ator ?? "—"}
        {mostrarEmpresa && l.empresa ? ` · ${l.empresa}` : ""}
      </p>
      {descreverDetalhes(l.detalhes) && <p className="text-xs text-zinc-500 break-words">{descreverDetalhes(l.detalhes)}</p>}
    </li>
  );
}

export default function AdminEmpresa({ id, navegar }) {
  const aviso = useAviso();
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState(false);
  const [pinNovo, setPinNovo] = useState(null); // { nome, pin }
  const painel = useDadosAdmin("admin_painel", {}, [versao]);
  const equipe = useDadosAdmin("admin_funcionarios", { p_empresa: id }, [versao]);
  const log = useDadosAdmin("admin_auditoria", { p_empresa: id, p_limite: 50 }, [versao]);
  const recarregar = () => setVersao((v) => v + 1);

  const empresa = painel.dados?.find((e) => e.id === id);
  if (painel.erro) return <Pagina><Vazio icone="⚠️">{painel.erro}</Vazio></Pagina>;
  if (!painel.dados) return <Pagina><div className="h-40 rounded-2xl bg-zinc-900 animate-pulse" /></Pagina>;
  if (!empresa) return <Pagina><Vazio icone="🏪">Restaurante não encontrado.</Vazio></Pagina>;

  const ativo = empresa.status === "ativa";
  const link = linkDoRestaurante(empresa.slug);

  async function mudarStatus() {
    const motivo = window.prompt(
      ativo
        ? `Suspender ${empresa.nome}? Todos os funcionários saem na hora e ninguém consegue entrar.\n\nMotivo:`
        : `Reativar ${empresa.nome}?\n\nMotivo (opcional):`
    );
    if (motivo === null) return;
    try {
      await rpcAdmin("admin_status_empresa", { p_id: id, p_status: ativo ? "suspensa" : "ativa", p_motivo: motivo });
      aviso(ativo ? "Restaurante suspenso." : "Restaurante reativado.", { tipo: ativo ? "info" : "sucesso" });
      recarregar();
    } catch (e) {
      aviso(traduzirErroAdmin(e), { tipo: "erro" });
    }
  }

  async function resetarPin(f) {
    if (!window.confirm(`Criar um PIN provisório para ${f.nome}? O PIN atual para de funcionar e a pessoa sai do sistema.`)) return;
    const pin = gerarPin();
    try {
      await rpcAdmin("admin_resetar_pin", { p_funcionario: f.id, p_pin: pin });
      setPinNovo({ nome: f.nome, pin });
      recarregar();
    } catch (e) {
      aviso(traduzirErroAdmin(e), { tipo: "erro" });
    }
  }

  async function acessarComo() {
    const motivo = window.prompt(
      `Entrar em ${empresa.nome} como suporte (2 horas).\nUma faixa vai aparecer na tela e tudo fica registrado.\n\nMotivo do acesso:`
    );
    if (!motivo?.trim()) return;
    try {
      const r = await rpcAdmin("admin_acessar_como", { p_empresa: id, p_motivo: motivo.trim() });
      sessionStorage.setItem(CHAVE_SESSAO, r.token);
      localStorage.setItem(CHAVE_RESTAURANTE, r.slug);
      window.location.hash = "#/";
      window.location.reload();
    } catch (e) {
      aviso(traduzirErroAdmin(e), { tipo: "erro" });
    }
  }

  return (
    <Pagina largura="max-w-3xl">
      <Cabecalho
        titulo={empresa.nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {ativo ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta cor="vermelho">Suspenso</Etiqueta>}
            <span>código {empresa.slug}</span>
          </span>
        }
      >
        <BotaoVoltar onClick={() => navegar("admin")} />
      </Cabecalho>

      {editando && <FormEditar empresa={empresa} onFechar={() => setEditando(false)} onSalvo={() => (setEditando(false), recarregar())} />}
      <Modal aberto={!!pinNovo} titulo="PIN provisório criado" onFechar={() => setPinNovo(null)}>
        {pinNovo && (
          <div className="space-y-3 text-sm">
            <p>
              Passe para <b>{pinNovo.nome}</b>:
            </p>
            <p className="text-4xl font-bold text-orange-400 text-center tracking-widest tabular-nums">{pinNovo.pin}</p>
            <p className="text-xs text-yellow-300">Ele não aparece de novo. A pessoa deve trocar no primeiro acesso.</p>
          </div>
        )}
      </Modal>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Hoje", moeda(empresa.vendasHoje), `${empresa.contasHoje} contas`],
          ["Mês", moeda(empresa.vendasMes), `${empresa.contasMes} contas`],
          ["Mesas abertas", `${empresa.mesasAbertas}/${empresa.mesas}`, `${moeda(empresa.emAberto)} em aberto`],
          ["Último acesso", empresa.ultimoAcesso ? tempoDecorrido(empresa.ultimoAcesso) : "nunca", null],
        ].map(([r, v, det]) => (
          <Cartao key={r} className="p-3">
            <p className="text-xs text-zinc-400">{r}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
            {det && <p className="text-[11px] text-zinc-500">{det}</p>}
          </Cartao>
        ))}
      </div>

      <Cartao className="space-y-3">
        <TituloSecao
          acao={
            <button type="button" className="text-xs text-orange-400 hover:underline" onClick={() => setEditando(true)}>
              Editar
            </button>
          }
        >
          Dados
        </TituloSecao>
        <dl className="text-sm space-y-1">
          {[
            ["Link da equipe", <code key="l" className="break-all text-xs">{link}</code>],
            ["CNPJ", empresa.cnpj || "—"],
            ["Plano", PLANOS.find((p) => p.id === empresa.plano)?.label ?? empresa.plano],
            ["Taxa de serviço", `${Math.round(empresa.taxaServico * 1000) / 10}%`],
            ["Criado em", dataHora(empresa.criadaEm)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-zinc-400 shrink-0">{k}</dt>
              <dd className="text-right min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Botao variante="primario" className="flex-1 py-2.5 text-sm" onClick={acessarComo} disabled={!ativo}>
            🛟 Acessar como suporte
          </Botao>
          <Botao variante={ativo ? "perigo" : "sucesso"} className="flex-1 py-2.5 text-sm" onClick={mudarStatus}>
            {ativo ? "⏸️ Suspender" : "▶️ Reativar"}
          </Botao>
        </div>
      </Cartao>

      <Cartao>
        <TituloSecao>Equipe</TituloSecao>
        {!equipe.dados ? (
          <div className="h-16 rounded-xl bg-zinc-800 animate-pulse" />
        ) : equipe.dados.length === 0 ? (
          <p className="text-sm text-zinc-500">Ninguém cadastrado.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {equipe.dados.map((f) => (
              <li key={f.id} className="py-2 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">
                    {f.nome} {!f.ativo && <span className="text-zinc-500 font-normal">(inativo)</span>}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {FUNCOES[f.funcao]?.emoji} {FUNCOES[f.funcao]?.label}
                    {f.pinPadrao && " · PIN provisório"}
                    {f.bloqueado && " · bloqueado agora"}
                  </span>
                </span>
                <Botao variante="fantasma" className="px-2 py-1.5 text-xs shrink-0" onClick={() => resetarPin(f)}>
                  Resetar PIN
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao>
        <TituloSecao
          acao={
            <button type="button" className="text-xs text-orange-400 hover:underline" onClick={() => navegar("admin", "auditoria", id)}>
              Ver tudo →
            </button>
          }
        >
          Últimas ações
        </TituloSecao>
        {!log.dados ? (
          <div className="h-16 rounded-xl bg-zinc-800 animate-pulse" />
        ) : log.dados.length === 0 ? (
          <p className="text-sm text-zinc-500">Nada registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {log.dados.slice(0, 15).map((l) => (
              <LinhaLog key={l.id} l={l} />
            ))}
          </ul>
        )}
      </Cartao>
    </Pagina>
  );
}
