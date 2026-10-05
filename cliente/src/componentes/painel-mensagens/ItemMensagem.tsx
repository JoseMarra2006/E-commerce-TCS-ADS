import type { RegistroMensagem } from "../../api/cliente-http.ts";
import { juntarClasses } from "../juntar-classes.ts";
import {
  classificarStatus,
  descreverStatus,
  extrairCaminho,
  extrairServidor,
  formatarCorpo,
  formatarHorario,
} from "./exibicao.ts";
import type { ClasseStatus } from "./exibicao.ts";
import estilos from "./PainelMensagens.module.css";

interface PropriedadesItemMensagem {
  registro: RegistroMensagem;
}

const CLASSES_SELO: Record<ClasseStatus, string> = {
  sucesso: estilos.seloSucesso ?? "",
  redirecionamento: estilos.seloRedirecionamento ?? "",
  erro_cliente: estilos.seloErroCliente ?? "",
  erro_servidor: estilos.seloErro ?? "",
  falha: estilos.seloErro ?? "",
};

function IconeCadeado() {
  return (
    <svg
      className={estilos.cadeado}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function BlocoCorpo({ texto }: { texto: string | null }) {
  const corpo = formatarCorpo(texto);
  return corpo === null
    ? <p className={estilos.semCorpo}>(sem corpo)</p>
    : <pre className={estilos.corpo}>{corpo}</pre>;
}

export function ItemMensagem({ registro }: PropriedadesItemMensagem) {
  const classe = classificarStatus(registro.status);
  const caminho = extrairCaminho(registro.url);
  const servidor = extrairServidor(registro.url);

  return (
    <li className={estilos.item}>
      <details className={estilos.detalhes}>
        <summary className={estilos.resumo}>
          <span className={estilos.horario}>{formatarHorario(registro.horario)}</span>
          <span className={estilos.metodo}>{registro.metodo}</span>
          <span className={juntarClasses(estilos.selo, CLASSES_SELO[classe])}>
            {descreverStatus(registro.status)}
          </span>
          <span className={estilos.duracao}>{registro.duracaoMs} ms</span>
          {registro.autenticado && (
            <span className={estilos.autenticado}>
              <IconeCadeado />
              <span className="visualmente-oculto">com token</span>
            </span>
          )}
          <span className={estilos.caminho} title={registro.url}>{caminho}</span>
        </summary>
        <div className={estilos.conteudoItem}>
          <section className={estilos.secao}>
            <h4 className={estilos.tituloSecao}>Enviado</h4>
            <p className={estilos.linhaInfo}>URL: {registro.url}</p>
            <p className={estilos.linhaInfo}>Servidor: {servidor === "" ? "(desconhecido)" : servidor}</p>
            <p className={estilos.linhaInfo}>
              {registro.autenticado ? "Autorização: Bearer (token oculto)" : "Autorização: sem token"}
            </p>
            <BlocoCorpo texto={registro.corpoEnviado} />
          </section>
          <section className={estilos.secao}>
            <h4 className={estilos.tituloSecao}>Recebido</h4>
            <p className={estilos.linhaInfo}>Status: {descreverStatus(registro.status)}</p>
            {registro.erro !== null && <p className={estilos.linhaInfo}>Erro: {registro.erro}</p>}
            <BlocoCorpo texto={registro.corpoRecebido} />
          </section>
        </div>
      </details>
    </li>
  );
}
