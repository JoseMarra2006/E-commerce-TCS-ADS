import { BrowserRouter } from "react-router";
import { ProvedoresAplicacao } from "./contextos/ProvedoresAplicacao.tsx";
import { ConfiguracaoRotas } from "./rotas/ConfiguracaoRotas.tsx";

export default function Aplicacao() {
  return (
    <ProvedoresAplicacao>
      <BrowserRouter>
        <ConfiguracaoRotas />
      </BrowserRouter>
    </ProvedoresAplicacao>
  );
}
