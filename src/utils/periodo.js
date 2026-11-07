// Períodos prontos dos relatórios (início e fim em milissegundos, horário do aparelho).

export const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mesPassado", label: "Mês passado" },
];

export function intervalo(id) {
  const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const hoje = new Date();
  const fimHoje = inicioDia(hoje) + 86400000 - 1;
  switch (id) {
    case "hoje":
      return [inicioDia(hoje), fimHoje];
    case "7d":
      return [inicioDia(hoje) - 6 * 86400000, fimHoje];
    case "30d":
      return [inicioDia(hoje) - 29 * 86400000, fimHoje];
    case "mes":
      return [new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime(), fimHoje];
    default: {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).getTime();
      return [ini, new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime() - 1];
    }
  }
}
