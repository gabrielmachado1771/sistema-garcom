import { useState } from "react";
import { rpcAdmin, traduzirErroAdmin } from "../store/supabaseAdmin";
import { linkDoRestaurante, normalizarCodigo } from "../utils/codigo";
import { classeInput } from "../utils/estilos";
import { Botao, BotaoVoltar, Cabecalho, Campo, Cartao, Pagina } from "../components/ui";
import useDadosAdmin from "./useDadosAdmin";
import { PLANOS, gerarPin } from "./textos";

const ETAPAS = ["Restaurante", "Administrador", "Cardápio", "Revisar"];

function Passos({ atual }) {
  return (
    <ol className="flex gap-2 text-xs" aria-label="Etapas">
      {ETAPAS.map((e, i) => (
        <li
          key={e}
          aria-current={i === atual ? "step" : undefined}
          className={`flex-1 rounded-full py-1.5 text-center font-semibold ${
            i === atual ? "bg-orange-500 text-black" : i < atual ? "bg-green-600/30 text-green-300" : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {i < atual ? "✓ " : `${i + 1}. `}
          {e}
        </li>
      ))}
    </ol>
  );
}

export default function AdminNovo({ navegar }) {
  const { dados: empresas } = useDadosAdmin("admin_painel", {});
  const [etapa, setEtapa] = useState(0);
  const [d, setD] = useState({
    nome: "",
    slug: "",
    slugEditado: false,
    cnpj: "",
    plano: "gratis",
    taxa: "10",
    mesas: "10",
    adminNome: "",
    adminPin: gerarPin(),
    modelo: "",
  });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [criado, setCriado] = useState(null);

  const mudar = (campo, valor) => setD((x) => ({ ...x, [campo]: valor }));
  const taxa = Number(String(d.taxa).replace(",", "."));
  const mesas = Number(d.mesas);

  const errosEtapa = [
    () =>
      !d.nome.trim()
        ? "Informe o nome do restaurante."
        : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug) || d.slug.length < 2
          ? "Informe um código válido (letras minúsculas, números e hífen)."
          : (empresas ?? []).some((e) => e.slug === d.slug)
            ? "Já existe um restaurante com esse código."
            : !(taxa >= 0 && taxa <= 30)
              ? "A taxa precisa ficar entre 0% e 30%."
              : !(Number.isInteger(mesas) && mesas >= 1 && mesas <= 60)
                ? "Número de mesas entre 1 e 60."
                : "",
    () => (!d.adminNome.trim() ? "Informe o nome do administrador." : !/^\d{4}$/.test(d.adminPin) ? "O PIN precisa ter 4 números." : ""),
    () => "",
    () => "",
  ];

  function avancar() {
    const e = errosEtapa[etapa]();
    setErro(e);
    if (!e) setEtapa(etapa + 1);
  }

  async function criar() {
    setEnviando(true);
    setErro("");
    try {
      const r = await rpcAdmin("admin_criar_empresa", {
        p_nome: d.nome.trim(),
        p_slug: d.slug,
        p_admin_nome: d.adminNome.trim(),
        p_admin_pin: d.adminPin,
        p_cnpj: d.cnpj.trim() || null,
        p_plano: d.plano,
        p_taxa: taxa / 100,
        p_mesas: mesas,
        p_modelo: d.modelo || null,
      });
      setCriado({ ...r, nome: d.nome.trim(), adminNome: d.adminNome.trim(), pin: d.adminPin });
    } catch (e) {
      setErro(traduzirErroAdmin(e));
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    const link = linkDoRestaurante(criado.slug);
    const mensagem =
      `Olá! O sistema do ${criado.nome} está pronto.\n` +
      `Link: ${link}\n` +
      `Entre como "${criado.adminNome}" com o PIN provisório ${criado.pin} e troque o PIN no primeiro acesso (aba Equipe).`;
    return (
      <Pagina>
        <Cartao className="space-y-4 border-green-500/40">
          <p className="text-4xl text-center" aria-hidden>
            🎉
          </p>
          <h1 className="text-xl font-bold text-center">{criado.nome} foi criado!</h1>
          <div className="bg-zinc-800/60 rounded-xl p-3 text-sm space-y-1">
            <p>
              <span className="text-zinc-400">Link:</span> <code className="break-all">{link}</code>
            </p>
            <p>
              <span className="text-zinc-400">Administrador:</span> {criado.adminNome}
            </p>
            <p>
              <span className="text-zinc-400">PIN provisório:</span> <b className="text-orange-400 text-lg">{criado.pin}</b>
            </p>
          </div>
          <p className="text-xs text-yellow-300">
            ⚠️ Anote ou envie agora: o PIN não aparece de novo. Se perder, use “Resetar PIN” no restaurante.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Botao
              variante="primario"
              className="flex-1 py-3"
              onClick={() => navigator.clipboard?.writeText(mensagem).catch(() => window.prompt("Copie:", mensagem))}
            >
              Copiar mensagem para o cliente
            </Botao>
            <Botao className="flex-1 py-3" onClick={() => navegar("admin", "empresa", criado.id)}>
              Abrir o restaurante
            </Botao>
          </div>
        </Cartao>
      </Pagina>
    );
  }

  return (
    <Pagina>
      <Cabecalho titulo="Novo restaurante" subtitulo={`Etapa ${etapa + 1} de ${ETAPAS.length}`}>
        <BotaoVoltar onClick={() => (etapa ? setEtapa(etapa - 1) : navegar("admin"))} />
      </Cabecalho>
      <Passos atual={etapa} />

      <Cartao className="space-y-4">
        {etapa === 0 && (
          <>
            <Campo rotulo="Nome do restaurante">
              <input
                autoFocus
                maxLength={60}
                value={d.nome}
                onChange={(e) =>
                  setD((x) => ({ ...x, nome: e.target.value, slug: x.slugEditado ? x.slug : normalizarCodigo(e.target.value) }))
                }
                className={classeInput}
              />
            </Campo>
            <Campo rotulo="Código (vai no link)" dica={d.slug ? linkDoRestaurante(d.slug) : "ex.: pizzaria-centro"}>
              <input
                maxLength={40}
                value={d.slug}
                onChange={(e) => setD((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), slugEditado: true }))}
                className={classeInput}
              />
            </Campo>
            <Campo rotulo="CNPJ (opcional)">
              <input inputMode="numeric" value={d.cnpj} onChange={(e) => mudar("cnpj", e.target.value)} className={classeInput} />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Plano">
                <select value={d.plano} onChange={(e) => mudar("plano", e.target.value)} className={classeInput}>
                  {PLANOS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Taxa (%)">
                <input inputMode="decimal" value={d.taxa} onChange={(e) => mudar("taxa", e.target.value)} className={classeInput} />
              </Campo>
              <Campo rotulo="Mesas">
                <input inputMode="numeric" value={d.mesas} onChange={(e) => mudar("mesas", e.target.value)} className={classeInput} />
              </Campo>
            </div>
          </>
        )}

        {etapa === 1 && (
          <>
            <p className="text-sm text-zinc-400">
              Quem vai administrar o restaurante. Ele entra com o PIN provisório e cadastra o resto da equipe.
            </p>
            <Campo rotulo="Nome do administrador">
              <input autoFocus maxLength={40} value={d.adminNome} onChange={(e) => mudar("adminNome", e.target.value)} className={classeInput} />
            </Campo>
            <Campo rotulo="PIN provisório (4 números)" dica="Ele troca no primeiro acesso.">
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={d.adminPin}
                  onChange={(e) => mudar("adminPin", e.target.value.replace(/\D/g, ""))}
                  className={`${classeInput} text-lg tracking-widest tabular-nums`}
                />
                <Botao className="px-3 text-sm shrink-0" onClick={() => mudar("adminPin", gerarPin())}>
                  Gerar outro
                </Botao>
              </div>
            </Campo>
          </>
        )}

        {etapa === 2 && (
          <>
            <p className="text-sm text-zinc-400">Como o cardápio começa?</p>
            <div className="space-y-2" role="radiogroup">
              <label className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer ${!d.modelo ? "border-orange-500 bg-orange-500/10" : "border-zinc-800"}`}>
                <input type="radio" name="modelo" checked={!d.modelo} onChange={() => mudar("modelo", "")} className="mt-1 accent-orange-500" />
                <span>
                  <span className="block font-semibold text-sm">Vazio</span>
                  <span className="block text-xs text-zinc-500">O administrador cadastra os produtos na aba Cardápio.</span>
                </span>
              </label>
              {(empresas ?? []).map((e) => (
                <label
                  key={e.id}
                  className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer ${d.modelo === e.slug ? "border-orange-500 bg-orange-500/10" : "border-zinc-800"}`}
                >
                  <input type="radio" name="modelo" checked={d.modelo === e.slug} onChange={() => mudar("modelo", e.slug)} className="mt-1 accent-orange-500" />
                  <span>
                    <span className="block font-semibold text-sm">Copiar de {e.nome}</span>
                    <span className="block text-xs text-zinc-500">Categorias, produtos e preços de hoje (dá para editar depois).</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {etapa === 3 && (
          <dl className="text-sm divide-y divide-zinc-800">
            {[
              ["Restaurante", d.nome],
              ["Código / link", linkDoRestaurante(d.slug)],
              ["CNPJ", d.cnpj || "—"],
              ["Plano", PLANOS.find((p) => p.id === d.plano)?.label],
              ["Taxa de serviço", `${d.taxa}%`],
              ["Mesas", d.mesas],
              ["Administrador", d.adminNome],
              ["PIN provisório", d.adminPin],
              ["Cardápio", d.modelo ? `copiado de ${(empresas ?? []).find((e) => e.slug === d.modelo)?.nome}` : "vazio"],
            ].map(([k, v]) => (
              <div key={k} className="py-2 flex justify-between gap-3">
                <dt className="text-zinc-400">{k}</dt>
                <dd className="font-semibold text-right break-all">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}

        {etapa < 3 ? (
          <Botao variante="primario" className="w-full py-3" onClick={avancar}>
            Continuar
          </Botao>
        ) : (
          <Botao variante="sucesso" className="w-full py-3" onClick={criar} disabled={enviando}>
            {enviando ? "Criando…" : "Criar restaurante"}
          </Botao>
        )}
      </Cartao>
    </Pagina>
  );
}
