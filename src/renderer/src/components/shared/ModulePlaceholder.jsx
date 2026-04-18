import './ModulePlaceholder.css'

export default function ModulePlaceholder({ module }) {
  const labels = {
    rooms:      { icon: '🏠', label: 'Room Manager', desc: 'Gestión y edición de rooms (Sprint 4)' },
    assets:     { icon: '🖼', label: 'Asset Studio',  desc: 'Gestión de assets PCX (Sprint 4)' },
    dialogues:  { icon: '💬', label: 'Dialogue Tree', desc: 'Editor de árboles de diálogo (próximamente)' },
    sequences:  { icon: '🎬', label: 'Sequences',     desc: 'Editor de grafos de secuencias (próximamente)' },
    scripts:    { icon: '📜', label: 'Script Editor', desc: 'Editor de scripts (próximamente)' },
  }
  const info = labels[module] || { icon: '🔧', label: module, desc: 'Próximamente' }

  return (
    <div className="module-placeholder">
      <span className="module-placeholder__icon">{info.icon}</span>
      <h2>{info.label}</h2>
      <p>{info.desc}</p>
    </div>
  )
}
