export default function Home({ setTela }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 flex items-center justify-center px-4">
      <div className="bg-zinc-900/80 backdrop-blur p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border border-zinc-800">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
          <span className="text-3xl">🍽</span>
        </div>

        <h1 className="text-3xl font-bold text-orange-500 mb-1">Sistema Restaurante</h1>
        <p className="text-zinc-400 mb-8 text-sm">Escolha o ambiente para entrar</p>

        <div className="space-y-3">
          <button
            onClick={() => setTela("garcom")}
            className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] transition-all text-black font-bold px-4 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-orange-500/10"
          >
            <span className="text-xl">📝</span>
            <span>Garçom</span>
          </button>

          <button
            onClick={() => setTela("cozinha")}
            className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all text-white font-bold px-4 py-4 rounded-2xl flex items-center justify-center gap-3"
          >
            <span className="text-xl">👨‍🍳</span>
            <span>Cozinha</span>
          </button>

          <button
            onClick={() => setTela("caixa")}
            className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all text-white font-bold px-4 py-4 rounded-2xl flex items-center justify-center gap-3"
          >
            <span className="text-xl">💰</span>
            <span>Caixa</span>
          </button>
        </div>
      </div>
    </div>
  );
}
