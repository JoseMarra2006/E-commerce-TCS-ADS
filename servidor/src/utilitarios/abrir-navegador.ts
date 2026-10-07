interface TentativaAbertura {
  programa: string;
  argumentos: string[];
}

function montarTentativas(url: string): TentativaAbertura[] {
  if (Deno.build.os === "windows") {
    return [
      { programa: "cmd", argumentos: ["/c", "start", "", "firefox", url] },
      { programa: "cmd", argumentos: ["/c", "start", "", url] },
    ];
  }

  if (Deno.build.os === "darwin") {
    return [
      { programa: "open", argumentos: ["-a", "Firefox", url] },
      { programa: "open", argumentos: [url] },
    ];
  }

  return [
    { programa: "firefox", argumentos: [url] },
    { programa: "xdg-open", argumentos: [url] },
  ];
}

async function executarTentativa(
  tentativa: TentativaAbertura,
): Promise<boolean> {
  try {
    const comando = new Deno.Command(tentativa.programa, {
      args: tentativa.argumentos,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    });
    const resultado = await comando.output();
    return resultado.success;
  } catch {
    return false;
  }
}

export async function abrirNavegador(url: string): Promise<boolean> {
  for (const tentativa of montarTentativas(url)) {
    if (await executarTentativa(tentativa)) {
      return true;
    }
  }
  return false;
}
