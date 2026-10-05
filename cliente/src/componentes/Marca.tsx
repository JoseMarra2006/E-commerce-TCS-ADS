import estilos from "./Marca.module.css";

export function Marca() {
  return (
    <span className={estilos.marca}>
      <span className={estilos.simbolo}>
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={estilos.raio}>
          <path d="M37 7 L15 36 H29 L25 57 L49 25 H34 Z" fill="currentColor" />
        </svg>
      </span>
      <span className={estilos.nome}>Bilheteria Relâmpago</span>
    </span>
  );
}
