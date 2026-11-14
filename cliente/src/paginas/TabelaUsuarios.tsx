import { useId } from "react";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { SeloTipoUsuario } from "../componentes/SeloTipoUsuario.tsx";
import type { LinhaUsuario } from "./lista-usuarios.ts";
import estilos from "./PaginaUsuarios.module.css";

interface PropriedadesTabelaUsuarios {
  linhas: readonly LinhaUsuario[];
  recarregando: boolean;
}

export function TabelaUsuarios({ linhas, recarregando }: PropriedadesTabelaUsuarios) {
  const idLegenda = useId();

  return (
    <div className={estilos.rolagem} role="region" aria-labelledby={idLegenda} tabIndex={0}>
      <table className={estilos.tabela} aria-busy={recarregando ? true : undefined}>
        <caption id={idLegenda} className={estilos.legenda}>Usuários cadastrados</caption>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">E-mail</th>
            <th scope="col">Tipo</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id}>
              <td className={estilos.celulaTexto}>
                {linha.nome}
                {linha.ehVoce && " "}
                {linha.ehVoce && <span className={estilos.voce}>Você</span>}
              </td>
              <td className={estilos.celulaTexto}>{linha.email}</td>
              <td>
                <SeloTipoUsuario administrador={linha.administrador}>{linha.tipo}</SeloTipoUsuario>
              </td>
              <td>
                {linha.caminhoDetalhe === null
                  ? <LinkTexto para="/perfil">Meu perfil</LinkTexto>
                  : (
                    <LinkTexto
                      para={linha.caminhoDetalhe}
                      rotuloAcessivel={`Ver detalhes de ${linha.nome}`}
                    >
                      Ver detalhes
                    </LinkTexto>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
