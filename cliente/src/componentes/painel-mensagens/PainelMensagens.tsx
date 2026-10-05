import { useId, useState } from "react";
import { useRegistros } from "../../contextos/use-registros.ts";
import { juntarClasses } from "../juntar-classes.ts";
import { ItemMensagem } from "./ItemMensagem.tsx";
import estilos from "./PainelMensagens.module.css";

export function PainelMensagens() {
  const { registros, limparRegistros } = useRegistros();
  const [expandido, setExpandido] = useState(false);
  const idLista = useId();
  const total = registros.length;
  const maisRecentesPrimeiro = [...registros].reverse();

  return (
    <section
      className={juntarClasses(estilos.painel, expandido && estilos.expandido)}
      aria-label="Painel de mensagens"
    >
      <div className={estilos.barra}>
        <button
          type="button"
          className={estilos.alternar}
          aria-expanded={expandido}
          aria-controls={idLista}
          aria-label={`${expandido ? "Ocultar" : "Mostrar"} mensagens (${total})`}
          onClick={() => setExpandido((atual) => !atual)}
        >
          <span aria-hidden="true">Mensagens</span>
          <span className={estilos.contador} aria-hidden="true">{total}</span>
        </button>
        <button
          type="button"
          className={estilos.limpar}
          disabled={total === 0}
          onClick={limparRegistros}
        >
          Limpar
        </button>
      </div>
      <div id={idLista} className={estilos.area} hidden={!expandido}>
        {total === 0
          ? (
            <p className={estilos.vazio}>
              Nenhuma mensagem trocada ainda. As requisições enviadas aos servidores aparecerão aqui.
            </p>
          )
          : (
            <ul className={estilos.lista}>
              {maisRecentesPrimeiro.map((registro) => (
                <ItemMensagem key={registro.id} registro={registro} />
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
