import { Navigate, Route, Routes } from "react-router";
import { Layout } from "../componentes/Layout.tsx";
import { PaginaConexao } from "../paginas/PaginaConexao.tsx";

export function ConfiguracaoRotas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/conexao" replace />} />
        <Route path="/conexao" element={<PaginaConexao />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
