import { fileURLToPath } from "node:url";

interface SituacaoArquivo {
  existe: boolean;
  modificadoEm: number | null;
}

type Situacoes = Record<string, SituacaoArquivo>;

const ARQUIVOS_REAIS = ["ecommerce.db", "segredo-jwt.txt"];

function resolverCaminho(nome: string): string {
  return fileURLToPath(new URL(`../../dados/${nome}`, import.meta.url));
}

function caminhoBase(): string {
  return resolverCaminho(`teste-vigia-${Deno.pid}.json`);
}

function lerSituacaoAtual(): Situacoes {
  const situacoes: Situacoes = {};
  for (const nome of ARQUIVOS_REAIS) {
    try {
      const informacao = Deno.statSync(resolverCaminho(nome));
      situacoes[nome] = {
        existe: true,
        modificadoEm: informacao.mtime?.getTime() ?? null,
      };
    } catch (erro) {
      if (!(erro instanceof Deno.errors.NotFound)) {
        throw erro;
      }
      situacoes[nome] = { existe: false, modificadoEm: null };
    }
  }
  return situacoes;
}

function registrarSituacaoInicial(): void {
  try {
    Deno.mkdirSync(resolverCaminho(""), { recursive: true });
    Deno.writeTextFileSync(
      caminhoBase(),
      JSON.stringify(lerSituacaoAtual()),
      { createNew: true },
    );
  } catch (erro) {
    if (!(erro instanceof Deno.errors.AlreadyExists)) {
      throw erro;
    }
  }
}

export function encontrarArquivosReaisAlterados(): string[] {
  const inicial: Situacoes = JSON.parse(Deno.readTextFileSync(caminhoBase()));
  const atual = lerSituacaoAtual();
  const problemas: string[] = [];
  for (const nome of ARQUIVOS_REAIS) {
    if (!inicial[nome].existe && atual[nome].existe) {
      problemas.push(`${nome} foi criado durante os testes`);
    } else if (
      inicial[nome].existe &&
      inicial[nome].modificadoEm !== atual[nome].modificadoEm
    ) {
      problemas.push(`${nome} foi modificado durante os testes`);
    }
  }
  return problemas;
}

export function removerRegistroInicial(): void {
  try {
    Deno.removeSync(caminhoBase());
  } catch (erro) {
    if (!(erro instanceof Deno.errors.NotFound)) {
      throw erro;
    }
  }
}

registrarSituacaoInicial();
