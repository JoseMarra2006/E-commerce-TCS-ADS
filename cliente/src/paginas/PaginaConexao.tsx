import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { useConexao } from "../contextos/use-conexao.ts";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { validarFormularioConexao } from "../validacao/validacao-campos.ts";
import type { ErrosConexao } from "../validacao/validacao-campos.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaConexao.module.css";

interface ResultadoExibido {
  tipo: "sucesso" | "aviso";
  mensagem: string;
}

export function PaginaConexao() {
  useTituloPagina("Conectar ao servidor");
  const { conexao, definirConexao } = useConexao();
  const { sessao, encerrarSessaoLocal } = useSessao();
  const operacoes = useOperacoes();

  const [ip, setIp] = useState(conexao?.ip ?? "");
  const [porta, setPorta] = useState(conexao === null ? "" : String(conexao.porta));
  const [erros, setErros] = useState<ErrosConexao>({});
  const [resultado, setResultado] = useState<ResultadoExibido | null>(null);
  const [verificando, setVerificando] = useState(false);

  const referenciaIp = useRef<HTMLInputElement>(null);
  const referenciaPorta = useRef<HTMLInputElement>(null);

  function alterarIp(valor: string) {
    setIp(valor);
    setResultado(null);
    setErros((atuais) => ({ ...atuais, ip: undefined }));
  }

  function alterarPorta(valor: string) {
    setPorta(valor);
    setResultado(null);
    setErros((atuais) => ({ ...atuais, porta: undefined }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setResultado(null);

    const validacao = validarFormularioConexao({ ip, porta });
    if (!validacao.ok) {
      setErros(validacao.erros);
      if (validacao.erros.ip !== undefined) {
        referenciaIp.current?.focus();
      } else {
        referenciaPorta.current?.focus();
      }
      return;
    }

    setErros({});
    setVerificando(true);
    const nova = validacao.dados;

    try {
      const mudou = conexao === null || conexao.ip !== nova.ip || conexao.porta !== nova.porta;
      if (sessao !== null && mudou) {
        await operacoes.sair(sessao.idSessao, sessao.token);
        encerrarSessaoLocal();
      }

      definirConexao(nova);
      setIp(nova.ip);
      setPorta(String(nova.porta));

      const verificacao = await operacoes.verificarServidor();
      if (verificacao.ok) {
        setResultado({
          tipo: "sucesso",
          mensagem:
            `Servidor encontrado em ${nova.ip}:${nova.porta} (respondeu em ${verificacao.dados.duracaoMs} ms).`,
        });
      } else {
        setResultado({
          tipo: "aviso",
          mensagem: `A conexão foi salva, mas o servidor não respondeu: ${verificacao.mensagem}`,
        });
      }
    } finally {
      setVerificando(false);
    }
  }

  return (
    <CartaoIngresso
      rotulo="Primeiro passo"
      titulo="Conectar ao servidor"
      descricao="Informe o IP e a porta do servidor que você deseja usar."
      largura="estreita"
    >
      {sessao !== null && (
        <Alerta
          tipo="aviso"
          mensagem={`Você está conectado como ${sessao.usuario.nome}. Ao trocar de servidor, sua sessão atual será encerrada.`}
        />
      )}

      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="IP do servidor"
          valor={ip}
          aoAlterar={alterarIp}
          placeholder="ex.: 10.20.50.123"
          autoComplete="off"
          inputMode="text"
          desabilitado={verificando}
          erro={erros.ip}
          referencia={referenciaIp}
        />
        <CampoTexto
          rotulo="Porta"
          valor={porta}
          aoAlterar={alterarPorta}
          placeholder="ex.: 20000"
          autoComplete="off"
          inputMode="numeric"
          desabilitado={verificando}
          erro={erros.porta}
          referencia={referenciaPorta}
        />
        <Botao tipo="submit" carregando={verificando} textoCarregando="Verificando...">
          Salvar e verificar
        </Botao>
      </form>

      {resultado !== null && <Alerta tipo={resultado.tipo} mensagem={resultado.mensagem} />}
      {resultado !== null && resultado.tipo === "sucesso" && (
        <p className={estilos.continuar}>
          <LinkTexto para="/">Continuar</LinkTexto>
        </p>
      )}
    </CartaoIngresso>
  );
}
