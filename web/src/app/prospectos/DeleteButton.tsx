'use client';

export function DeleteButton() {
  return (
    <button
      type="submit"
      className="danger"
      onClick={(e) => {
        if (!window.confirm('¿Eliminar este prospecto? Esta acción no se puede deshacer.')) {
          e.preventDefault();
        }
      }}
    >
      🗑️ Eliminar
    </button>
  );
}
