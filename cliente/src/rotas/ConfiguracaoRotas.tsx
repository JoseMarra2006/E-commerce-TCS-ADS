import { Navigate, Route, Routes } from "react-router";
import { Layout } from "../componentes/Layout.tsx";
import { PaginaCadastro } from "../paginas/PaginaCadastro.tsx";
import { PaginaEditarCadastro } from "../paginas/PaginaEditarCadastro.tsx";
import { PaginaConexao } from "../paginas/PaginaConexao.tsx";
import { PaginaLogin } from "../paginas/PaginaLogin.tsx";
import { PaginaPerfil } from "../paginas/PaginaPerfil.tsx";
import { DestinoInicial } from "./DestinoInicial.tsx";
import { RotaComSessao } from "./RotaComSessao.tsx";
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
