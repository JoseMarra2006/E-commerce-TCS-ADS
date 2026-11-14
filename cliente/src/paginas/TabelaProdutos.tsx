import { useId } from "react";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloEsgotado } from "../componentes/SeloEsgotado.tsx";
import type { LinhaProduto } from "./lista-produtos.ts";
import estilos from "./PaginaProdutos.module.css";

interface PropriedadesTabelaProdutos {
  linhas: readonly LinhaProduto[];
  recarregando: boolean;
  mostrarEditar?: boolean;
}

export function TabelaProdutos({
  linhas,
  recarregando,
  mostrarEditar = false,
}: PropriedadesTabelaProdutos) {
  const idLegenda = useId();

  return (
    <div className={estilos.rolagem} role="region" aria-labelledby={idLegenda} tabIndex={0}>
      <table className={estilos.tabela} aria-busy={recarregando ? true : undefined}>
        <caption id={idLegenda} className={estilos.legenda}>Produtos cadastrados</caption>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Descrição</th>
            <th scope="col" className={estilos.numero}>Quantidade</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id}>
              <td className={estilos.celulaTexto}>{linha.nome}</td>
              <td className={estilos.celulaTexto}>
                {linha.semDescricao
                  ? <span className={estilos.semDescricao}>{linha.resumoDescricao}</span>
                  : linha.resumoDescricao}
              </td>
              <td className={estilos.numero}>
                <span className={estilos.quantidade}>
                  {linha.quantidade}
                  {linha.esgotado && <SeloEsgotado />}
                </span>
              </td>
              <td>
                <span className={estilos.acoesLinha}>
                  <LinkTexto
                    para={linha.caminhoDetalhe}
                    rotuloAcessivel={`Ver detalhes de ${linha.nome}`}
                  >
                    Ver detalhes
                  </LinkTexto>
                  {mostrarEditar && (
                    <LinkTexto para={linha.caminhoEdicao} rotuloAcessivel={`Editar ${linha.nome}`}>
                      Editar
                    </LinkTexto>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
