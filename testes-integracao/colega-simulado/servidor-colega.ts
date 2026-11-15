export type ModoColega =
  | "correto"
  | "divergente"
  | "quebrado"
  | "lento"
  | "enorme"
  | "sem_location"
  | "location_diferente"
  | "sem_admin"
  | "mensagens_diferentes";

export const MODOS_COLEGA: readonly ModoColega[] = [
  "correto",
  "divergente",
  "quebrado",
  "lento",
  "enorme",
  "sem_location",
  "location_diferente",
  "sem_admin",
  "mensagens_diferentes",
];

export interface OpcoesColega {
  atrasoMs?: number;
  hostname?: string;
}

export interface ServidorColega {
  porta: number;
  encerrar: () => Promise<void>;
  obterToken: (email: string) => string | null;
}

interface UsuarioColega {
  id: number;
  nome: string;
  email: string;
  senha: string;
  admin: boolean;
}

interface SessaoColega {
  id: string;
  usuarioId: number;
  token: string;
}

interface ProdutoColega {
  id: number;
  nome: string;
  descricao: string;
  quantidade: number;
}

export const ID_ADM_COLEGA = 1000;
export const EMAIL_ADM_COLEGA = "adm@teste.com";
export const SENHA_ADM_COLEGA = "admin123";
export const NOME_ADM_COLEGA = "Admin";
export const LOCATION_DIFERENTE_COLEGA = "http://colega.invalido/outra/rota";
export const MENSAGENS_COLEGA_DIFERENTES: Readonly<Record<number, string>> = {
  400: "O colega recusou os dados enviados.",
  401: "O colega não reconheceu a sua credencial.",
  403: "O colega negou o acesso a este recurso.",
  404: "O colega não encontrou o que foi pedido.",
  405: "O colega não aceita este método aqui.",
  409: "O colega já tem esse e-mail cadastrado.",
};

const PREFIXO = "/api/v1";
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REGEX_SENHA = /^[a-zA-Z0-9]+$/;
const REGEX_DIGITOS = /^[0-9]+$/;
const ATRASO_PADRAO_MS = 1500;
const TAMANHO_CORPO_ENORME = 3 * 1024 * 1024;
const QUANTIDADE_MAXIMA = 1000000;
const PAGINA_HTML_ERRO =
  "<html><head><title>Erro</title></head><body><h1>Algo deu errado</h1></body></html>";

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerObjeto(texto: string): Record<string, unknown> | null {
  try {
    const dados: unknown = JSON.parse(texto);
    return ehObjeto(dados) ? dados : null;
  } catch {
    return null;
  }
}

function tamanho(texto: string): number {
  return Array.from(texto).length;
}

function validarNome(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "O campo nome deve ser um texto.";
  }
  const total = tamanho(valor.trim());
  return total < 3 || total > 50
    ? "O campo nome deve ter entre 3 e 50 caracteres."
    : null;
}

function validarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "O campo email deve ser um texto.";
  }
  return valor.length < 5 || valor.length > 30 || !REGEX_EMAIL.test(valor)
    ? "O campo email é inválido."
    : null;
}

function validarSenha(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "O campo senha deve ser um texto.";
  }
  return valor.length < 6 || valor.length > 20 || !REGEX_SENHA.test(valor)
    ? "O campo senha é inválido."
    : null;
}

function validarNomeProduto(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "O nome do produto deve ser um texto.";
  }
  const total = tamanho(valor.trim());
  return total < 2 || total > 100
    ? "O nome do produto deve ter entre 2 e 100 caracteres."
    : null;
}

function validarDescricao(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "A descrição do produto deve ser um texto.";
  }
  return tamanho(valor.trim()) > 500
    ? "A descrição do produto deve ter no máximo 500 caracteres."
    : null;
}

function validarQuantidade(valor: unknown): string | null {
  if (typeof valor !== "number" || !Number.isInteger(valor)) {
    return "A quantidade deve ser um número inteiro.";
  }
  return valor < 0 || valor > QUANTIDADE_MAXIMA
    ? "A quantidade deve estar entre 0 e 1.000.000."
    : null;
}

function lerIdDaUrl(texto: string): number | null {
  if (!REGEX_DIGITOS.test(texto)) {
    return null;
  }
  const id = Number(texto);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function criarTratador(modo: ModoColega) {
  const usuarios = new Map<number, UsuarioColega>();
  const sessoes = new Map<string, SessaoColega>();
  const produtos = new Map<number, ProdutoColega>();
  let proximoId = 1;
  let proximoIdProduto = 1;

  usuarios.set(ID_ADM_COLEGA, {
    id: ID_ADM_COLEGA,
    nome: NOME_ADM_COLEGA,
    email: EMAIL_ADM_COLEGA,
    senha: SENHA_ADM_COLEGA,
    admin: true,
  });

  function gerarIdUsuario(): number {
    while (usuarios.has(proximoId)) {
      proximoId++;
    }
    return proximoId++;
  }

  function json(
    status: number,
    corpo: unknown,
    local?: string,
  ): Response {
    const cabecalhos = new Headers({
      "Content-Type": "application/json; charset=utf-8",
    });
    if (local !== undefined) {
      cabecalhos.set("Location", local);
    }
    return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
  }

  function vazia(status: number): Response {
    return new Response(null, { status });
  }

  function erro(status: number, mensagem: string): Response {
    if (modo === "quebrado") {
      return new Response(PAGINA_HTML_ERRO, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (modo === "mensagens_diferentes") {
      return json(status, {
        mensagem: MENSAGENS_COLEGA_DIFERENTES[status] ?? mensagem,
      });
    }
    return json(status, { mensagem });
  }

  function criado(corpo: unknown, caminho: string): Response {
    if (modo === "divergente") {
      return json(200, corpo);
    }
    if (modo === "sem_location") {
      return json(201, corpo);
    }
    if (modo === "location_diferente") {
      return json(201, corpo, LOCATION_DIFERENTE_COLEGA);
    }
    return json(201, corpo, `${PREFIXO}${caminho}`);
  }

  function confirmacao(): Response {
    return modo === "divergente" ? json(200, { ok: true }) : vazia(204);
  }

  function usuarioPublico(usuario: UsuarioColega): Record<string, unknown> {
    if (modo === "divergente") {
      return {
        id: String(usuario.id),
        nome: usuario.nome,
        email: usuario.email,
        criadoEm: "2026-01-01T00:00:00.000Z",
        papel: usuario.admin ? "administrador" : "comum",
      };
    }
    if (modo === "sem_admin") {
      return { id: usuario.id, nome: usuario.nome, email: usuario.email };
    }
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      admin: usuario.admin,
    };
  }

  function produtoPublico(produto: ProdutoColega): Record<string, unknown> {
    if (modo === "divergente") {
      return {
        id: String(produto.id),
        nome: produto.nome,
        descricao: produto.descricao,
        quantidade: produto.quantidade,
        categoria: "geral",
        atualizadoEm: "2026-01-01T00:00:00.000Z",
      };
    }
    return { ...produto };
  }

  function buscarPorEmail(email: string): UsuarioColega | null {
    const alvo = email.toLowerCase();
    for (const usuario of usuarios.values()) {
      if (usuario.email.toLowerCase() === alvo) {
        return usuario;
      }
    }
    return null;
  }

  function autenticar(requisicao: Request): UsuarioColega | null {
    const cabecalho = requisicao.headers.get("Authorization") ?? "";
    if (!cabecalho.startsWith("Bearer ")) {
      return null;
    }
    const token = cabecalho.slice("Bearer ".length);
    for (const sessao of sessoes.values()) {
      if (sessao.token === token) {
        return usuarios.get(sessao.usuarioId) ?? null;
      }
    }
    return null;
  }

  function cadastrar(corpo: Record<string, unknown>): Response {
    const problema = validarNome(corpo.nome) ?? validarEmail(corpo.email) ??
      validarSenha(corpo.senha);
    if (
      problema !== null || typeof corpo.nome !== "string" ||
      typeof corpo.email !== "string" || typeof corpo.senha !== "string"
    ) {
      return erro(400, problema ?? "Dados inválidos.");
    }
    if (buscarPorEmail(corpo.email) !== null) {
      return erro(409, "E-mail já cadastrado. Faça login.");
    }
    const usuario: UsuarioColega = {
      id: gerarIdUsuario(),
      nome: corpo.nome.trim(),
      email: corpo.email,
      senha: corpo.senha,
      admin: false,
    };
    usuarios.set(usuario.id, usuario);
    if (modo === "quebrado") {
      return new Response("cadastro concluído", {
        status: 201,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return criado(usuarioPublico(usuario), `/users/${usuario.id}`);
  }

  function entrar(corpo: Record<string, unknown>): Response {
    const problema = validarEmail(corpo.email) ?? validarSenha(corpo.senha);
    if (
      problema !== null || typeof corpo.email !== "string" ||
      typeof corpo.senha !== "string"
    ) {
      return erro(400, problema ?? "Dados inválidos.");
    }
    const usuario = buscarPorEmail(corpo.email);
    if (usuario === null || usuario.senha !== corpo.senha) {
      return erro(401, "E-mail ou senha inválidos.");
    }
    const sessao: SessaoColega = {
      id: crypto.randomUUID(),
      usuarioId: usuario.id,
      token: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    };
    sessoes.set(sessao.id, sessao);
    const resposta: Record<string, unknown> = {
      id: sessao.id,
      token: sessao.token,
      usuario: usuarioPublico(usuario),
    };
    if (modo === "quebrado") {
      delete resposta.token;
    }
    if (modo === "divergente") {
      resposta.criadoEm = "2026-01-01T00:00:00.000Z";
    }
    return criado(resposta, `/sessions/${sessao.id}`);
  }

  function listarUsuarios(requisicao: Request): Response {
    const autor = autenticar(requisicao);
    if (autor === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    if (!autor.admin) {
      return erro(403, "Apenas administradores listam usuários.");
    }
    const lista = [...usuarios.values()].sort((a, b) => a.id - b.id);
    return json(200, lista.map(usuarioPublico));
  }

  function lerUsuario(usuario: UsuarioColega): Response {
    if (modo === "enorme") {
      return json(200, {
        id: usuario.id,
        nome: "a".repeat(TAMANHO_CORPO_ENORME),
        email: usuario.email,
        admin: usuario.admin,
      });
    }
    if (modo === "quebrado") {
      return json(200, { id: usuario.id, nome: 123, email: usuario.email });
    }
    return json(200, usuarioPublico(usuario));
  }

  function validarAtualizacaoUsuario(
    corpo: Record<string, unknown>,
    completa: boolean,
  ): string | null {
    const campos = ["nome", "email", "senha"];
    if (completa) {
      const ausente = campos.find((campo) => !(campo in corpo));
      if (ausente !== undefined) {
        return `O campo ${ausente} é obrigatório.`;
      }
    } else if (!campos.some((campo) => campo in corpo)) {
      return "Envie ao menos um campo para atualizar.";
    }
    return ("nome" in corpo ? validarNome(corpo.nome) : null) ??
      ("email" in corpo ? validarEmail(corpo.email) : null) ??
      ("senha" in corpo ? validarSenha(corpo.senha) : null);
  }

  function atualizar(
    usuario: UsuarioColega,
    corpo: Record<string, unknown>,
    completa: boolean,
  ): Response {
    const problema = validarAtualizacaoUsuario(corpo, completa);
    if (problema !== null) {
      return erro(400, problema);
    }
    if (typeof corpo.email === "string") {
      const existente = buscarPorEmail(corpo.email);
      if (existente !== null && existente.id !== usuario.id) {
        return erro(409, "E-mail já cadastrado por outro usuário.");
      }
      usuario.email = corpo.email;
    }
    if (typeof corpo.nome === "string") {
      usuario.nome = corpo.nome.trim();
    }
    if (typeof corpo.senha === "string") {
      usuario.senha = corpo.senha;
    }
    return json(200, usuarioPublico(usuario));
  }

  function excluirUsuario(usuario: UsuarioColega): Response {
    usuarios.delete(usuario.id);
    for (const [idSessao, sessao] of sessoes) {
      if (sessao.usuarioId === usuario.id) {
        sessoes.delete(idSessao);
      }
    }
    return confirmacao();
  }

  async function rotaUsuario(
    requisicao: Request,
    idTexto: string,
  ): Promise<Response> {
    const autor = autenticar(requisicao);
    if (autor === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    const id = lerIdDaUrl(idTexto);
    if (id === null) {
      return erro(400, "O id do usuário é inválido.");
    }
    if (id !== autor.id && !autor.admin) {
      return erro(403, "Você não pode acessar este usuário.");
    }
    const usuario = usuarios.get(id);
    if (usuario === undefined) {
      return erro(404, "Usuário não encontrado.");
    }
    if (requisicao.method === "GET") {
      return lerUsuario(usuario);
    }
    if (requisicao.method === "DELETE") {
      return excluirUsuario(usuario);
    }
    const corpo = lerObjeto(await requisicao.text());
    if (corpo === null) {
      return erro(400, "O corpo da requisição é inválido.");
    }
    return atualizar(usuario, corpo, requisicao.method === "PUT");
  }

  function rotaSessao(requisicao: Request, idSessao: string): Response {
    const autor = autenticar(requisicao);
    if (autor === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    const alvo = sessoes.get(idSessao);
    if (alvo === undefined || alvo.usuarioId !== autor.id) {
      return erro(403, "Você não pode encerrar esta sessão.");
    }
    sessoes.delete(alvo.id);
    return confirmacao();
  }

  function validarProduto(
    corpo: Record<string, unknown>,
    completo: boolean,
  ): string | null {
    const campos = ["nome", "descricao", "quantidade"];
    if (completo) {
      const ausente = campos.find((campo) => !(campo in corpo));
      if (ausente !== undefined) {
        return `O campo ${ausente} é obrigatório.`;
      }
    } else if (!campos.some((campo) => campo in corpo)) {
      return "Envie ao menos um campo do produto para atualizar.";
    }
    return ("nome" in corpo ? validarNomeProduto(corpo.nome) : null) ??
      ("descricao" in corpo ? validarDescricao(corpo.descricao) : null) ??
      ("quantidade" in corpo ? validarQuantidade(corpo.quantidade) : null);
  }

  function aplicarProduto(
    produto: ProdutoColega,
    corpo: Record<string, unknown>,
  ): void {
    if (typeof corpo.nome === "string") {
      produto.nome = corpo.nome.trim();
    }
    if (typeof corpo.descricao === "string") {
      produto.descricao = corpo.descricao.trim();
    }
    if (typeof corpo.quantidade === "number") {
      produto.quantidade = corpo.quantidade;
    }
  }

  async function rotaColecaoProdutos(requisicao: Request): Promise<Response> {
    const autor = autenticar(requisicao);
    if (autor === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    if (requisicao.method === "GET") {
      const lista = [...produtos.values()].sort((a, b) => a.id - b.id);
      return json(200, lista.map(produtoPublico));
    }
    if (!autor.admin) {
      return erro(403, "Apenas administradores cadastram produtos.");
    }
    const corpo = lerObjeto(await requisicao.text());
    if (corpo === null) {
      return erro(400, "O corpo da requisição é inválido.");
    }
    const problema = validarProduto(corpo, true);
    if (problema !== null) {
      return erro(400, problema);
    }
    const produto: ProdutoColega = {
      id: proximoIdProduto++,
      nome: "",
      descricao: "",
      quantidade: 0,
    };
    aplicarProduto(produto, corpo);
    produtos.set(produto.id, produto);
    return criado(produtoPublico(produto), `/products/${produto.id}`);
  }

  async function rotaProduto(
    requisicao: Request,
    idTexto: string,
  ): Promise<Response> {
    const autor = autenticar(requisicao);
    if (autor === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    const id = lerIdDaUrl(idTexto);
    if (id === null) {
      return erro(400, "O id do produto é inválido.");
    }
    if (requisicao.method !== "GET" && !autor.admin) {
      return erro(403, "Apenas administradores alteram produtos.");
    }
    const produto = produtos.get(id);
    if (produto === undefined) {
      return erro(404, "Produto não encontrado.");
    }
    if (requisicao.method === "GET") {
      return json(200, produtoPublico(produto));
    }
    if (requisicao.method === "DELETE") {
      produtos.delete(id);
      return confirmacao();
    }
    const corpo = lerObjeto(await requisicao.text());
    if (corpo === null) {
      return erro(400, "O corpo da requisição é inválido.");
    }
    const problema = validarProduto(corpo, requisicao.method === "PUT");
    if (problema !== null) {
      return erro(400, problema);
    }
    aplicarProduto(produto, corpo);
    return json(200, produtoPublico(produto));
  }

  async function rotaCorpo(
    requisicao: Request,
    tratar: (corpo: Record<string, unknown>) => Response,
  ): Promise<Response> {
    const corpo = lerObjeto(await requisicao.text());
    if (corpo === null) {
      return erro(400, "O corpo da requisição é inválido.");
    }
    return tratar(corpo);
  }

  function metodoNaoPermitido(): Response {
    return erro(405, "Método não permitido.");
  }

  async function tratar(requisicao: Request): Promise<Response> {
    const caminho = new URL(requisicao.url).pathname.replace(/\/+$/, "");
    if (!caminho.startsWith(`${PREFIXO}/`)) {
      return erro(404, "Rota não encontrada.");
    }
    const [recurso, id, ...resto] = caminho.slice(PREFIXO.length + 1).split(
      "/",
    );
    const metodo = requisicao.method;
    const metodoDeItem = ["GET", "PUT", "PATCH", "DELETE"].includes(metodo);

    if (resto.length > 0) {
      return erro(404, "Rota não encontrada.");
    }
    if (recurso === "users" && id === undefined) {
      if (metodo === "POST") {
        return await rotaCorpo(requisicao, cadastrar);
      }
      return metodo === "GET"
        ? listarUsuarios(requisicao)
        : metodoNaoPermitido();
    }
    if (recurso === "sessions" && id === undefined) {
      return metodo === "POST"
        ? await rotaCorpo(requisicao, entrar)
        : metodoNaoPermitido();
    }
    if (recurso === "users" && id !== undefined) {
      return metodoDeItem
        ? await rotaUsuario(requisicao, id)
        : metodoNaoPermitido();
    }
    if (recurso === "sessions" && id !== undefined) {
      return metodo === "DELETE"
        ? rotaSessao(requisicao, id)
        : metodoNaoPermitido();
    }
    if (recurso === "products" && id === undefined) {
      return metodo === "GET" || metodo === "POST"
        ? await rotaColecaoProdutos(requisicao)
        : metodoNaoPermitido();
    }
    if (recurso === "products" && id !== undefined) {
      return metodoDeItem
        ? await rotaProduto(requisicao, id)
        : metodoNaoPermitido();
    }
    return erro(404, "Rota não encontrada.");
  }

  function obterToken(email: string): string | null {
    const usuario = buscarPorEmail(email);
    if (usuario === null) {
      return null;
    }
    let token: string | null = null;
    for (const sessao of sessoes.values()) {
      if (sessao.usuarioId === usuario.id) {
        token = sessao.token;
      }
    }
    return token;
  }

  return { tratar, obterToken };
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

export function iniciarServidorColega(
  modo: ModoColega,
  porta?: number,
  opcoes: OpcoesColega = {},
): Promise<ServidorColega> {
  const { tratar, obterToken } = criarTratador(modo);
  const atrasoMs = opcoes.atrasoMs ?? ATRASO_PADRAO_MS;

  const servidor = Deno.serve(
    {
      hostname: opcoes.hostname ?? "127.0.0.1",
      port: porta ?? 0,
      onListen: () => {},
      onError: () => new Response("Erro interno.", { status: 500 }),
    },
    async (requisicao: Request) => {
      if (modo === "lento") {
        await esperar(atrasoMs);
      }
      return await tratar(requisicao);
    },
  );

  if (servidor.addr.transport !== "tcp") {
    throw new Error("O servidor do colega deve escutar em TCP.");
  }

  return Promise.resolve({
    porta: servidor.addr.port,
    obterToken,
    encerrar: async () => {
      await servidor.shutdown();
    },
  });
}
