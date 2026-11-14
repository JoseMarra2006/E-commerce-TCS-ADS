import { Navigate, Route, Routes } from "react-router";
import { Layout } from "../componentes/Layout.tsx";
import { PaginaCadastro } from "../paginas/PaginaCadastro.tsx";
import { PaginaEditarCadastro } from "../paginas/PaginaEditarCadastro.tsx";
import { PaginaEditarProduto } from "../paginas/PaginaEditarProduto.tsx";
import { PaginaEditarUsuario } from "../paginas/PaginaEditarUsuario.tsx";
import { PaginaConexao } from "../paginas/PaginaConexao.tsx";
import { PaginaDetalheUsuario } from "../paginas/PaginaDetalheUsuario.tsx";
import { PaginaLogin } from "../paginas/PaginaLogin.tsx";
import { PaginaDetalheProduto } from "../paginas/PaginaDetalheProduto.tsx";
import { PaginaNovoProduto } from "../paginas/PaginaNovoProduto.tsx";
import { PaginaPerfil } from "../paginas/PaginaPerfil.tsx";
import { PaginaProdutos } from "../paginas/PaginaProdutos.tsx";
import { PaginaUsuarios } from "../paginas/PaginaUsuarios.tsx";
import { DestinoInicial } from "./DestinoInicial.tsx";
import { RotaComSessao } from "./RotaComSessao.tsx";
import { RotaProtegida } from "./RotaProtegida.tsx";
import { RotaSemSessao } from "./RotaSemSessao.tsx";

export function ConfiguracaoRotas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DestinoInicial />} />
        <Route path="/conexao" element={<PaginaConexao />} />
        <Route element={<RotaSemSessao />}>
          <Route path="/cadastro" element={<PaginaCadastro />} />
          <Route path="/login" element={<PaginaLogin />} />
        </Route>
        <Route element={<RotaComSessao />}>
          <Route path="/perfil" element={<PaginaPerfil />} />
          <Route path="/perfil/editar" element={<PaginaEditarCadastro />} />
          <Route path="/produtos" element={<PaginaProdutos />} />
          <Route path="/produtos/:id" element={<PaginaDetalheProduto />} />
        </Route>
        <Route element={<RotaProtegida requisito="admin" />}>
          <Route path="/usuarios" element={<PaginaUsuarios />} />
          <Route path="/usuarios/:id" element={<PaginaDetalheUsuario />} />
          <Route path="/usuarios/:id/editar" element={<PaginaEditarUsuario />} />
          <Route path="/produtos/novo" element={<PaginaNovoProduto />} />
          <Route path="/produtos/:id/editar" element={<PaginaEditarProduto />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
