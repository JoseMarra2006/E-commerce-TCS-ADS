export const TEXTO_PARADO =
  "Servidor parado. Inicie o servidor para ver os usuários logados.";
export const TEXTO_VAZIO = "Nenhum usuário logado no momento.";
export const TEXTO_INDISPONIVEL =
  "Lista de usuários logados indisponível no momento. Tentando novamente.";
export const TEXTO_CARREGANDO = "Carregando a lista de usuários logados.";
export const TEXTO_DESATUALIZADO =
  "Atualização interrompida. A lista pode estar desatualizada; reconectando ao servidor.";
export const TEXTO_SEM_DATA = "—";

const ESTADOS_VALIDOS = ["disponivel", "indisponivel"];
const TIPOS_VALIDOS = ["administrador", "comum"];

function ehObjeto(valor) {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehInteiro(valor, minimo) {
  return typeof valor === "number" && Number.isInteger(valor) &&
    valor >= minimo;
}

function interpretarUsuario(item) {
  if (!ehObjeto(item)) {
    return null;
  }

  const { id, nome, email, tipo, sessoes, desde } = item;

  if (
    !ehInteiro(id, 1) ||
    typeof nome !== "string" ||
    typeof email !== "string" ||
    !TIPOS_VALIDOS.includes(tipo) ||
    !ehInteiro(sessoes, 1) ||
    typeof desde !== "string"
  ) {
    return null;
  }

  return { id, nome, email, tipo, sessoes, desde };
}

export function interpretarEventoLogados(texto) {
  if (typeof texto !== "string") {
    return null;
  }

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return null;
  }

  if (!ehObjeto(dados) || !ESTADOS_VALIDOS.includes(dados.estado)) {
    return null;
  }

  if (!Array.isArray(dados.usuarios)) {
    return null;
  }

  const atualizadoEm = typeof dados.atualizadoEm === "string"
    ? dados.atualizadoEm
    : null;

  if (dados.estado === "indisponivel") {
    return { estado: "indisponivel", usuarios: [], atualizadoEm };
  }

  const usuarios = [];
  for (const item of dados.usuarios) {
    const usuario = interpretarUsuario(item);
    if (usuario !== null) {
      usuarios.push(usuario);
    }
  }

  return { estado: "disponivel", usuarios, atualizadoEm };
}

export function rotularTipo(tipo) {
  if (tipo === "administrador") {
    return "Administrador";
  }
  if (tipo === "comum") {
    return "Comum";
  }
  return "Desconhecido";
}

function doisDigitos(valor) {
  return String(valor).padStart(2, "0");
}

export function formatarDesde(valor) {
  if (typeof valor !== "string" || valor.trim().length === 0) {
    return TEXTO_SEM_DATA;
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return TEXTO_SEM_DATA;
  }

  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${
    String(data.getFullYear()).padStart(4, "0")
  } ${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${
    doisDigitos(data.getSeconds())
  }`;
}

export function textoContador(quantidade) {
  if (quantidade === 0) {
    return "Nenhum usuário logado";
  }
  if (quantidade === 1) {
    return "1 usuário logado";
  }
  return `${quantidade} usuários logados`;
}

export function montarLinhas(usuarios) {
  return usuarios.map((usuario) => ({
    nome: usuario.nome,
    email: usuario.email,
    tipo: rotularTipo(usuario.tipo),
    administrador: usuario.tipo === "administrador",
    sessoes: String(usuario.sessoes),
    desde: formatarDesde(usuario.desde),
  }));
}

function exibicao(modo, mensagem, contador, usuarios, conexaoAtiva) {
  return {
    modo,
    mensagem,
    contador,
    mostrarTabela: modo === "lista",
    linhas: montarLinhas(usuarios),
    desatualizado: !conexaoAtiva,
    aviso: conexaoAtiva ? null : TEXTO_DESATUALIZADO,
  };
}

export function decidirExibicao(logados, servidorEmExecucao, conexaoAtiva) {
  if (!servidorEmExecucao) {
    return exibicao("parado", TEXTO_PARADO, textoContador(0), [], conexaoAtiva);
  }

  if (logados === null) {
    return exibicao(
      "carregando",
      TEXTO_CARREGANDO,
      "Carregando",
      [],
      conexaoAtiva,
    );
  }

  if (logados.estado === "indisponivel") {
    return exibicao(
      "indisponivel",
      TEXTO_INDISPONIVEL,
      "Lista indisponível",
      [],
      conexaoAtiva,
    );
  }

  if (logados.usuarios.length === 0) {
    return exibicao("vazio", TEXTO_VAZIO, textoContador(0), [], conexaoAtiva);
  }

  return exibicao(
    "lista",
    "",
    textoContador(logados.usuarios.length),
    logados.usuarios,
    conexaoAtiva,
  );
}
