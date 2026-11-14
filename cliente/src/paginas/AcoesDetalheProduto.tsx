import { Botao } from "../componentes/Botao.tsx";
import { BotaoLink } from "../componentes/BotaoLink.tsx";

interface PropriedadesAcoesDetalheProduto {
  caminhoEdicao: string;
  aoExcluir: () => void;
}

export function AcoesDetalheProduto({ caminhoEdicao, aoExcluir }: PropriedadesAcoesDetalheProduto) {
  return (
    <>
      <BotaoLink para={caminhoEdicao}>Editar produto</BotaoLink>
      <Botao variante="perigo" aoClicar={aoExcluir}>Excluir produto</Botao>
    </>
  );
}
