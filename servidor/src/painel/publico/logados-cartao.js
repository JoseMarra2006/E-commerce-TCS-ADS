import { decidirExibicao, interpretarEventoLogados } from "./logados-visao.js";

function criarCelula(documento, texto) {
  const celula = documento.createElement("td");
  celula.textContent = texto;
  return celula;
}

function criarCelulaTipo(documento, linha) {
  const celula = documento.createElement("td");
  const selo = documento.createElement("span");
  selo.classList.add("selo-tipo");
  if (linha.administrador) {
    selo.classList.add("selo-tipo-administrador");
  }
  selo.textContent = linha.tipo;
  celula.append(selo);
  return celula;
}

function criarLinha(documento, linha) {
  const elementoLinha = documento.createElement("tr");
  const celulaSessoes = criarCelula(documento, linha.sessoes);
  celulaSessoes.classList.add("coluna-numero");
  elementoLinha.append(
    criarCelula(documento, linha.nome),
    criarCelula(documento, linha.email),
    criarCelulaTipo(documento, linha),
    celulaSessoes,
    criarCelula(documento, linha.desde),
  );
  return elementoLinha;
}

export function criarCartaoLogados(documento, elementos) {
  let logados = null;
  let servidorEmExecucao = false;
  let conexaoAtiva = true;
  let ultimoTextoBruto = null;
  let assinaturaLinhas = null;

  function renderizar() {
    const exibicao = decidirExibicao(logados, servidorEmExecucao, conexaoAtiva);

    elementos.contador.textContent = exibicao.contador;
    elementos.mensagem.textContent = exibicao.mensagem;
    elementos.mensagem.hidden = exibicao.mostrarTabela;
    elementos.aviso.textContent = exibicao.aviso ?? "";
    elementos.aviso.hidden = exibicao.aviso === null;
    elementos.areaTabela.hidden = !exibicao.mostrarTabela;
    if (exibicao.desatualizado) {
      elementos.areaTabela.classList.add("tabela-desatualizada");
    } else {
      elementos.areaTabela.classList.remove("tabela-desatualizada");
    }

    const assinatura = JSON.stringify(exibicao.linhas);
    if (assinatura !== assinaturaLinhas) {
      assinaturaLinhas = assinatura;
      elementos.corpo.replaceChildren(
        ...exibicao.linhas.map((linha) => criarLinha(documento, linha)),
      );
    }
  }

  function renderizarSemFalhar() {
    try {
      renderizar();
    } catch {
      return;
    }
  }

  renderizarSemFalhar();

  return {
    receberEvento(texto) {
      try {
        conexaoAtiva = true;
        if (texto === ultimoTextoBruto) {
          renderizar();
          return false;
        }
        const interpretado = interpretarEventoLogados(texto);
        if (interpretado === null) {
          renderizar();
          return false;
        }
        ultimoTextoBruto = texto;
        logados = interpretado;
        renderizar();
        return true;
      } catch {
        return false;
      }
    },
    definirStatusServidor(status) {
      try {
        const emExecucao = status === "em_execucao";
        if (emExecucao === servidorEmExecucao) {
          return;
        }
        servidorEmExecucao = emExecucao;
        renderizar();
      } catch {
        return;
      }
    },
    definirConexao(ativa) {
      try {
        const novaConexao = ativa === true;
        if (novaConexao === conexaoAtiva) {
          return;
        }
        conexaoAtiva = novaConexao;
        renderizar();
      } catch {
        return;
      }
    },
  };
}
