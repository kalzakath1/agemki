import { useState } from 'react'
import { useSceneStore } from '../../store/sceneStore'
import RoomManager from '../RoomManager/RoomManager'
import SceneEditor from '../SceneEditor/SceneEditor'

export default function RoomsModule() {
  const { activeRoom, openRoom } = useSceneStore()
  const [view, setView] = useState('manager') // 'manager' | 'scene'

  function handleOpenRoom(room) {
    openRoom(room)
    setView('scene')
  }

  function handleBack() {
    setView('manager')
  }

  if (view === 'scene' && activeRoom) {
    return <SceneEditor onBack={handleBack} />
  }

  return <RoomManager onOpenRoom={handleOpenRoom} />
}
