import { useState, useSyncExternalStore } from "react";
import { ehIphone, instalar, jaInstalado, ouvirInstalacao, podeInstalarDireto } from "../utils/instalar";
import { Botao, Modal } from "./ui";

/**
 * Botão "Instalar app".
 * - Android/Chrome/Edge: abre o convite de instalação do próprio navegador.
 * - iPhone/iPad: o Safari não tem convite, então mostra o passo a passo.
 * Some quando o app já está instalado (aberto pela tela inicial).
 */
export default function BotaoInstalar({ compacto = false }) {
  const direto = useSyncExternalStore(ouvirInstalacao, podeInstalarDireto, () => false);
  const [ajuda, setAjuda] = useState(false);

  if (jaInstalado() || (!direto && !ehIphone())) return null;

  return (
    <>
      <Botao
        variante={compacto ? "fantasma" : "secundario"}
        className={compacto ? "px-2 py-1.5 text-sm" : "px-4 py-2 text-sm"}
        title="Instalar o sistema como aplicativo"
        onClick={() => (direto ? instalar() : setAjuda(true))}
      >
        📲{compacto ? <span className="hidden sm:inline"> Instalar</span> : " Instalar como aplicativo"}
      </Botao>
      <Modal aberto={ajuda} titulo="Instalar no iPhone / iPad" onFechar={() => setAjuda(false)}>
        <ol className="space-y-3 text-sm text-zinc-300 list-decimal pl-5">
          <li>
            Abra este site no <strong>Safari</strong>.
          </li>
          <li>
            Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima ⬆️).
          </li>
          <li>
            Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li>
            Toque em <strong>Adicionar</strong>. O ícone 🍽️ aparece junto dos outros apps.
          </li>
        </ol>
        <p className="text-xs text-zinc-500 mt-4">
          Para receber notificações de pedido pronto no iPhone, abra pelo ícone da tela inicial e toque em “Ativar”.
        </p>
      </Modal>
    </>
  );
}
