export type ModoColega =
  | "correto"
  | "divergente"
  | "quebrado"
  | "lento"
  | "enorme";

export const MODOS_COLEGA: readonly ModoColega[] = [
  "correto",
  "divergente",
  "quebrado",
  "lento",
  "enorme",
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
}

interface SessaoColega {
  id: string;
  usuarioId: number;
  token: string;
}

const PREFIXO = "/api/v1";
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REGEX_SENHA = /^[a-zA-Z0-9]+$/;
const REGEX_DIGITOS = /^[0-9]+$/;
const ATRASO_PADRAO_MS = 1500;
const TAMANHO_CORPO_ENORME = 3 * 1024 * 1024;
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

function validarNome(valor: unknown): string | null {
  if (typeof valor !== "string") {
    return "O campo nome deve ser um texto.";
  }
  const tamanho = Array.from(valor.trim()).length;
  return tamanho < 3 || tamanho > 50
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

function criarTratador(modo: ModoColega) {
  const usuarios = new Map<number, UsuarioColega>();
  const sessoes = new Map<string, SessaoColega>();
  let proximoId = 1;

  function json(status: number, corpo: unknown): Response {
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
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
    return json(status, { mensagem });
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
        papel: "comum",
      };
    }
    return { id: usuario.id, nome: usuario.nome, email: usuario.email };
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

  function autenticar(requisicao: Request): SessaoColega | null {
    const cabecalho = requisicao.headers.get("Authorization") ?? "";
    if (!cabecalho.startsWith("Bearer ")) {
      return null;
    }
    const token = cabecalho.slice("Bearer ".length);
    for (const sessao of sessoes.values()) {
      if (sessao.token === token) {
        return sessao;
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
      id: proximoId++,
      nome: corpo.nome.trim(),
      email: corpo.email,
      senha: corpo.senha,
    };
    usuarios.set(usuario.id, usuario);
    if (modo === "quebrado") {
      return new Response("cadastro concluído", {
        status: 201,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return json(modo === "divergente" ? 200 : 201, usuarioPublico(usuario));
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
    return json(modo === "divergente" ? 200 : 201, resposta);
  }

  function lerUsuario(usuario: UsuarioColega): Response {
    if (modo === "enorme") {
      return json(200, {
        id: usuario.id,
        nome: "a".repeat(TAMANHO_CORPO_ENORME),
        email: usuario.email,
      });
    }
    if (modo === "quebrado") {
      return json(200, { id: usuario.id, nome: 123, email: usuario.email });
    }
    return json(200, usuarioPublico(usuario));
  }

  function atualizar(
    usuario: UsuarioColega,
    corpo: Record<string, unknown>,
  ): Response {
    const temAlgum = ["nome", "email", "senha"].some((campo) => campo in corpo);
    if (!temAlgum) {
      return erro(400, "Envie ao menos um campo para atualizar.");
    }
    const problema = ("nome" in corpo ? validarNome(corpo.nome) : null) ??
      ("email" in corpo ? validarEmail(corpo.email) : null) ??
      ("senha" in corpo ? validarSenha(corpo.senha) : null);
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
    const sessao = autenticar(requisicao);
    if (sessao === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    if (!REGEX_DIGITOS.test(idTexto)) {
      return erro(400, "O id do usuário é inválido.");
    }
    const id = Number(idTexto);
    if (id !== sessao.usuarioId) {
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
    return atualizar(usuario, corpo);
  }

  function rotaSessao(requisicao: Request, idSessao: string): Response {
    const sessao = autenticar(requisicao);
    if (sessao === null) {
      return erro(401, "Token inválido ou ausente.");
    }
    const alvo = sessoes.get(idSessao);
    if (alvo === undefined || alvo.usuarioId !== sessao.usuarioId) {
      return erro(403, "Você não pode encerrar esta sessão.");
    }
    sessoes.delete(alvo.id);
    return confirmacao();
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

  async function tratar(requisicao: Request): Promise<Response> {
    const caminho = new URL(requisicao.url).pathname.replace(/\/+$/, "");
    if (!caminho.startsWith(`${PREFIXO}/`)) {
      return erro(404, "Rota não encontrada.");
    }
    const [recurso, id, ...resto] = caminho.slice(PREFIXO.length + 1).split(
      "/",
    );
    const metodo = requisicao.method;

    if (resto.length > 0) {
      return erro(404, "Rota não encontrada.");
    }
    if (recurso === "users" && id === undefined) {
      return metodo === "POST"
        ? await rotaCorpo(requisicao, cadastrar)
        : erro(405, "Método não permitido.");
    }
    if (recurso === "sessions" && id === undefined) {
      return metodo === "POST"
        ? await rotaCorpo(requisicao, entrar)
        : erro(405, "Método não permitido.");
    }
    if (recurso === "users" && id !== undefined) {
      return metodo === "GET" || metodo === "PATCH" || metodo === "DELETE"
        ? await rotaUsuario(requisicao, id)
        : erro(405, "Método não permitido.");
    }
    if (recurso === "sessions" && id !== undefined) {
      return metodo === "DELETE"
        ? rotaSessao(requisicao, id)
        : erro(405, "Método não permitido.");
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
