import { useRestaurante } from "../store/contexto";
import { contarItens, itensConsumidos, totalMesa } from "../store/regras";
import { hora, moeda, plural } from "../utils/format";
import { Botao, Cabecalho, Cartao, Etiqueta, Pagina, Vazio } from "../components/ui";

export default function Caixa({ navegar }) {
  const { mesas, historico } = useRestaurante();
  const comConta = mesas.filter((m) => m.comandas.length > 0);
  const totalAberto = comConta.reduce((acc, m) => acc + totalMesa(m), 0);
  const vendido = historico.reduce((acc, v) => acc + v.total, 0);

  return (
    <Pagina>
      <Cabecalho titulo="Caixa" subtitulo="Mesas com conta aberta">
        <Botao className="px-4 py-2 text-sm" onClick={() => navegar("caixa", "historico")}>
          Histórico
        </Botao>
      </Cabecalho>

      <div className="grid grid-cols-2 gap-3">
        <Cartao>
          <p className="text-xs text-zinc-400">Em aberto</p>
          <p className="text-xl font-bold text-orange-500">{moeda(totalAberto)}</p>
        </Cartao>
        <Cartao>
          <p className="text-xs text-zinc-400">Recebido hoje</p>
          <p className="text-xl font-bold text-green-400">{moeda(vendido)}</p>
        </Cartao>
      </div>

      {comConta.length === 0 ? (
        <Vazio icone="💰">Nenhuma mesa com conta aberta.</Vazio>
      ) : (
        comConta.map((mesa) => {
          const emPreparo = mesa.comandas.some((c) => c.status !== "entregue");
          return (
            <Cartao key={mesa.id} className="flex justify-between items-center gap-3 hover:border-zinc-700 transition">
              <div className="min-w-0">
                <p className="font-bold text-lg flex items-center gap-2">
                  Mesa {mesa.numero}
                  {emPreparo && <Etiqueta cor="amarelo">Pedido em andamento</Etiqueta>}
                </p>
                <p className="text-sm text-zinc-400">
                  {plural(contarItens(itensConsumidos(mesa)), "item", "itens")}
                  {mesa.abertaEm && ` · desde ${hora(mesa.abertaEm)}`}
                  {mesa.atendente && ` · ${mesa.atendente.nome}`}
                </p>
                <p className="text-orange-500 font-bold">{moeda(totalMesa(mesa))}</p>
              </div>
              <Botao variante="primario" className="px-5 py-3 shrink-0" onClick={() => navegar("caixa", mesa.id)}>
                Ver conta
              </Botao>
            </Cartao>
          );
        })
      )}
    </Pagina>
  );
}
