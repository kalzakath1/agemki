import { useAppStore } from './store/appStore'
import { useDialogueStore } from './store/dialogueStore'
import { useScriptStore }   from './store/scriptStore'
import { useSequenceStore } from './store/sequenceStore'
import { useCharStore }     from './store/charStore'
import { useLocaleStore }   from './store/localeStore'
import GameManager from './components/GameManager/GameManager'
import EditorLayout from './components/shared/EditorLayout'
import AssetStudio from './components/AssetStudio/AssetStudio'
import RoomsModule from './components/RoomManager/RoomsModule'
import ObjectLibrary from './components/ObjectLibrary/ObjectLibrary'
import ModulePlaceholder from './components/shared/ModulePlaceholder'
import VerbsetEditor from './components/VerbsetEditor/VerbsetEditor'
import LocalizationManager from './components/LocalizationManager/LocalizationManager'
import AudioManager from './components/AudioManager/AudioManager'
import CharacterLibrary from './components/CharacterLibrary/CharacterLibrary'
import DialogueEditor from './components/DialogueEditor/DialogueEditor'
import ScriptEditor from './components/ScriptEditor/ScriptEditor'
import SequenceEditor from './components/SequenceEditor/SequenceEditor'
import BuildManager from './components/BuildManager/BuildManager'
import GameParams from './components/GameParams/GameParams'
import AttributeEditor from './components/AttributeEditor/AttributeEditor'
import EditorSettings from './components/EditorSettings/EditorSettings'

// Expose stores globally so EditorLayout can check dirty state without circular imports
window._stores = {
  dialogue: useDialogueStore,
  script:   useScriptStore,
  sequence: useSequenceStore,
  char:     useCharStore,
  locale:   useLocaleStore,
}

function resolveModule(id) {
  return {
    assets:       <AssetStudio />,
    rooms:        <RoomsModule />,
    objects:      <ObjectLibrary />,
    verbsets:     <VerbsetEditor />,
    attributes:   <AttributeEditor />,
    localization: <LocalizationManager />,
    audio:        <AudioManager />,
    characters:   <CharacterLibrary />,
    dialogues:    <DialogueEditor />,
    scripts:      <ScriptEditor />,
    sequences:    <SequenceEditor />,
    gameparams:   <GameParams />,
    build:        <BuildManager />,
    settings:     <EditorSettings />,
  }[id] || <ModulePlaceholder module={id} />
}

export default function App() {
  const { activeGame, activeModule, secondaryModule } = useAppStore()

  if (!activeGame) return <GameManager />

  return (
    <EditorLayout secondary={resolveModule(secondaryModule)}>
      {resolveModule(activeModule)}
    </EditorLayout>
  )
}
