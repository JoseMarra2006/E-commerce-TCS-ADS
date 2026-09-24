export function obterEnderecosAcesso(porta: number): string[] {
  const enderecos: string[] = [`http://localhost:${porta}/api/v1`];

  let interfaces: Deno.NetworkInterfaceInfo[];

  try {
    interfaces = Deno.networkInterfaces();
  } catch {
    return enderecos;
  }

  const ipsJaAdicionados = new Set<string>();

  for (const interfaceRede of interfaces) {
    if (interfaceRede.family !== "IPv4") {
      continue;
    }

    if (interfaceRede.address.startsWith("127.")) {
      continue;
    }

    if (ipsJaAdicionados.has(interfaceRede.address)) {
      continue;
    }

    ipsJaAdicionados.add(interfaceRede.address);
    enderecos.push(`http://${interfaceRede.address}:${porta}/api/v1`);
  }

  return enderecos;
}
