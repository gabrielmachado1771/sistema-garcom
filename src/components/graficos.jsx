import { useState } from "react";
import { moeda } from "../utils/format";

/** Gráfico de colunas de uma série só, com dica ao passar o dedo/mouse. */
export function Colunas({ dados, rotulo, dica, titulo }) {
  const [ativo, setAtivo] = useState(null);
  const max = Math.max(...dados.map((d) => d.valor), 0);
  const marcarRotulo = (i) => dados.length <= 12 || i % Math.ceil(dados.length / 10) === 0 || i === dados.length - 1;

  return (
    <figure className="m-0">
      <div className="relative">
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1 tabular-nums">
          <span>{moeda(max)}</span>
        </div>
        <div
          className="h-40 flex items-end gap-[2px] border-b border-zinc-700"
          role="img"
          aria-label={titulo}
          onMouseLeave={() => setAtivo(null)}
        >
          {dados.map((d, i) => (
            <button
              type="button"
              key={d.chave}
              onMouseEnter={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              onClick={() => setAtivo(ativo === i ? null : i)}
              aria-label={`${rotulo(d)}: ${dica(d)}`}
              className="flex-1 h-full flex items-end min-w-0 focus-visible:outline-none group"
            >
              <span
                className={`w-full rounded-t-[4px] transition-colors ${
                  ativo === i ? "bg-orange-300" : "bg-orange-500 group-hover:bg-orange-400"
                }`}
                style={{ height: max ? `${Math.max((d.valor / max) * 100, d.valor > 0 ? 2 : 0)}%` : 0 }}
              />
            </button>
          ))}
        </div>
        {ativo != null && dados[ativo] && (
          <div
            className="absolute top-0 z-10 pointer-events-none bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs shadow-xl whitespace-nowrap"
            style={{
              left: `${((ativo + 0.5) / dados.length) * 100}%`,
              transform: `translateX(${ativo / dados.length > 0.6 ? "-100%" : ativo / dados.length < 0.4 ? "0" : "-50%"})`,
            }}
          >
            <p className="font-semibold text-zinc-200">{rotulo(dados[ativo])}</p>
            <p className="text-zinc-400">{dica(dados[ativo])}</p>
          </div>
        )}
      </div>
      <div className="flex gap-[2px] mt-1">
        {dados.map((d, i) => (
          <span key={d.chave} className="flex-1 min-w-0 text-center text-[10px] text-zinc-500 overflow-visible whitespace-nowrap">
            {marcarRotulo(i) ? d.eixo : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barra horizontal com o valor escrito ao lado (para listas ordenadas). */
export function BarraLinha({ rotulo, valor, max, texto }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="truncate">{rotulo}</span>
        <span className="font-semibold tabular-nums whitespace-nowrap">{texto}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${max ? (valor / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
