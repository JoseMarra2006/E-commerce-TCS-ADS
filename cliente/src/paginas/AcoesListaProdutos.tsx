import { Botao } from "../componentes/Botao.tsx";
import { BotaoLink } from "../componentes/BotaoLink.tsx";
import { CAMINHO_NOVO_PRODUTO } from "./caminhos-produtos.ts";
import estilos from "./PaginaProdutos.module.css";

interface PropriedadesAcoesListaProdutos {
  recarregando: boolean;
  podeCadastrar: boolean;
  aoRecarregar: () => void;
}

export function AcoesListaProdutos({
  recarregando,
  podeCadastrar,
  aoRecarregar,
}: PropriedadesAcoesListaProdutos) {
  return (
    <div className={estilos.acoes}>
      <Botao
        variante="secundaria"
        carregando={recarregando}
        textoCarregando="Atualizando..."
        aoClicar={aoRecarregar}
      >
        Atualizar lista
      </Botao>
      {podeCadastrar && <BotaoLink para={CAMINHO_NOVO_PRODUTO}>Novo produto</BotaoLink>}
    </div>
  );
}
