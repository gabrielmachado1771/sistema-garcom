// Componentes visuais reutilizados pelas telas.

import { FUNCOES, chaveItem, iniciais } from "../store/regras";
import { useTema } from "../utils/tema";

const tamanhosAvatar = { p: "w-8 h-8 text-xs", m: "w-12 h-12 text-base", g: "w-16 h-16 text-xl" };

export function Avatar({ funcionario, tamanho = "m" }) {
  return (
    <span
      aria-hidden
      className={`${tamanhosAvatar[tamanho]} ${FUNCOES[funcionario.funcao]?.cor ?? "bg-zinc-700"} rounded-full font-bold flex items-center justify-center shrink-0`}
    >
      {iniciais(funcionario.nome)}
    </span>
  );
}

export function Pagina({ children, largura = "max-w-lg", className = "" }) {
  return (
    <main className={`text-tinta p-4 animate-entrada ${className}`}>
      <div className={`${largura} mx-auto space-y-4`}>{children}</div>
    </main>
  );
}

export function Cabecalho({ titulo, subtitulo, children }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight truncate">{titulo}</h1>
        {subtitulo && <div className="text-sm text-zinc-400 mt-0.5">{subtitulo}</div>}
      </div>
      {children && <div className="flex gap-2 shrink-0">{children}</div>}
    </header>
  );
}

const variantes = {
  primario: "bg-orange-500 hover:bg-orange-600 text-black shadow-sm shadow-orange-500/20",
  secundario: "bg-zinc-800 hover:bg-zinc-700 text-tinta border border-zinc-700/60",
  sucesso: "bg-green-600 hover:bg-green-500 text-white",
  perigo: "bg-red-600/80 hover:bg-red-600 text-white",
  fantasma: "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-tinta",
};

export function Botao({ variante = "secundario", className = "", ...props }) {
  return (
    <button
      type="button"
      className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${variantes[variante]} ${className}`}
      {...props}
    />
  );
}

export function BotaoVoltar({ onClick, children = "← Voltar" }) {
  return (
    <Botao onClick={onClick} className="px-4 py-2 text-sm">
      {children}
    </Botao>
  );
}

export function Cartao({ className = "", children, ...props }) {
  return (
    <section
      className={`bg-zinc-900 rounded-2xl border border-zinc-800 p-4 ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function TituloSecao({ children, acao }) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2">
      <h2 className="font-semibold text-xs text-zinc-500 uppercase tracking-widest">{children}</h2>
      {acao}
    </div>
  );
}

export function Vazio({ icone, children }) {
  return (
    <Cartao className="p-8 text-center">
      {icone && <p className="text-4xl mb-3" aria-hidden>{icone}</p>}
      <p className="text-zinc-400">{children}</p>
    </Cartao>
  );
}

const cores = {
  amarelo: "bg-yellow-500/15 text-yellow-400",
  verde: "bg-green-500/15 text-green-400",
  laranja: "bg-orange-500/15 text-orange-400",
  vermelho: "bg-red-500/15 text-red-400",
  cinza: "bg-zinc-700/50 text-zinc-300",
};

export function Etiqueta({ cor = "cinza", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap ${cores[cor]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ListaItens({ itens, render }) {
  return (
    <ul className="divide-y divide-zinc-800/60">
      {itens.map((item) => (
        <li key={chaveItem(item)} className="py-2 flex items-center justify-between gap-3">
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

export function Modal({ titulo, aberto, onFechar, children }) {
  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
      onKeyDown={(e) => e.key === "Escape" && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="bg-zinc-900 border border-zinc-800 shadow-2xl w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto animate-entrada"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="w-11 h-11 -mr-2 rounded-xl text-zinc-400 hover:text-tinta hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({ rotulo, erro, dica, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-zinc-400">{rotulo}</span>
      <div className="mt-1">{children}</div>
      {erro ? (
        <span className="block text-xs text-red-400 mt-1">{erro}</span>
      ) : (
        dica && <span className="block text-xs text-zinc-500 mt-1">{dica}</span>
      )}
    </label>
  );
}

export function BotaoTema({ className = "" }) {
  const [tema, alternar] = useTema();
  const claro = tema === "claro";
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={claro ? "Usar tema escuro" : "Usar tema claro"}
      title={claro ? "Tema escuro" : "Tema claro"}
      className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg text-zinc-400 hover:text-tinta hover:bg-zinc-800 transition ${className}`}
    >
      <span aria-hidden>{claro ? "☾" : "☀"}</span>
    </button>
  );
}
