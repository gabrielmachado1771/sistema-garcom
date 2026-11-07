import { useMemo, useState } from "react";
import { PERIODOS, intervalo } from "../utils/periodo";
import { Cabecalho, Cartao, Pagina, Vazio } from "../components/ui";
import useDadosAdmin from "./useDadosAdmin";
import { LinhaLog } from "./AdminEmpresa";
import { ACOES, descreverDetalhes } from "./textos";

export default function AdminAuditoria({ empresaInicial }) {
  const [empresa, setEmpresa] = useState(empresaInicial ?? "");
  const [periodo, setPeriodo] = useState("7d");
  const [busca, setBusca] = useState("");
  const { dados: empresas } = useDadosAdmin("admin_painel", {});
  const [de, ate] = useMemo(() => intervalo(periodo), [periodo]);
  const { dados, erro, carregando } = useDadosAdmin("admin_auditoria", {
    p_empresa: empresa || null,
    p_de: new Date(de).toISOString(),
    p_ate: new Date(ate).toISOString(),
    p_limite: 1000,
  });

  const termo = busca.trim().toLowerCase();
  const visiveis = (dados ?? []).filter(
    (l) =>
      !termo ||
      [ACOES[l.acao] ?? l.acao, l.ator, l.empresa, descreverDetalhes(l.detalhes)].join(" ").toLowerCase().includes(termo)
  );

  return (
    <Pagina largura="max-w-3xl">
      <Cabecalho titulo="Auditoria" subtitulo="Quem fez o quê e quando" />
      <div className="flex flex-wrap gap-2">
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          aria-label="Restaurante"
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
        >
          <option value="">Todos os restaurantes</option>
          {(empresas ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-label="Período"
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
        >
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="🔍 Buscar (ação, pessoa, produto…)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-48 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
        />
      </div>
      {erro ? (
        <Vazio icone="⚠️">{erro}</Vazio>
      ) : !dados ? (
        <div className="h-40 rounded-2xl bg-zinc-900 animate-pulse" aria-busy="true" />
      ) : visiveis.length === 0 ? (
        <Vazio icone="📋">Nada registrado com esses filtros.</Vazio>
      ) : (
        <Cartao className={carregando ? "opacity-50" : ""}>
          <p className="text-xs text-zinc-500 mb-1">{visiveis.length} registros</p>
          <ul className="divide-y divide-zinc-800">
            {visiveis.map((l) => (
              <LinhaLog key={l.id} l={l} mostrarEmpresa={!empresa} />
            ))}
          </ul>
        </Cartao>
      )}
    </Pagina>
  );
}
