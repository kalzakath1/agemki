import { useState } from 'react'
import { useFlagStore } from '../../store/flagStore'
import './FlagPicker.css'

/**
 * Selector de flags globales con opción de creación inline.
 *
 * Props:
 *   value       — ID del flag seleccionado (string) o vacío
 *   onChange    — (flagId: string) => void
 *   placeholder — texto cuando no hay flag seleccionado (opcional)
 *   className   — clase CSS extra (opcional)
 */
export default function FlagPicker({ value, onChange, placeholder, className }) {
  const flags   = useFlagStore(s => s.flags)
  const addFlag = useFlagStore(s => s.addFlag)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newDesc, setNewDesc]   = useState('')

  function handleSelectChange(e) {
    if (e.target.value === '__new__') {
      setCreating(true)
      setNewName('')
      setNewDesc('')
    } else {
      onChange(e.target.value || '')
    }
  }

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = addFlag(trimmed, newDesc)
    onChange(id)
    setCreating(false)
  }

  function handleCancelCreate() {
    setCreating(false)
  }

  const selectedFlag = flags.find(f => f.id === value)

  if (creating) {
    return (
      <div className={`flag-picker flag-picker--creating ${className || ''}`}>
        <div className="flag-picker__form-row">
          <input
            className="flag-picker__form-name"
            autoFocus
            placeholder="Nombre del flag (ej: puerta_norte_abierta)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') handleCancelCreate() }}
          />
        </div>
        <textarea
          className="flag-picker__form-desc"
          placeholder="Descripción: para qué sirve este flag (opcional)"
          value={newDesc}
          rows={2}
          onChange={e => setNewDesc(e.target.value)}
        />
        <div className="flag-picker__form-actions">
          <button
            className="btn-primary flag-picker__form-ok"
            disabled={!newName.trim()}
            onClick={handleCreate}
          >Crear flag</button>
          <button
            className="flag-picker__form-cancel"
            onClick={handleCancelCreate}
          >Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flag-picker ${className || ''}`}>
      <select
        className="flag-picker__select"
        value={value || ''}
        onChange={handleSelectChange}
      >
        <option value="">{placeholder || '— seleccionar flag —'}</option>
        {flags.length > 0 && (
          <optgroup label="Flags del proyecto">
            {flags.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </optgroup>
        )}
        <option value="__new__">＋ Crear nuevo flag...</option>
      </select>
      {selectedFlag?.description && (
        <span className="flag-picker__desc" title={selectedFlag.description}>
          {selectedFlag.description}
        </span>
      )}
    </div>
  )
}
