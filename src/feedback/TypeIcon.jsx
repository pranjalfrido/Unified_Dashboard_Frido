import { Bug, WarningCircle, Lightbulb, PlusCircle } from '@phosphor-icons/react'

const ICONS = { bug: Bug, wrong_number: WarningCircle, suggestion: Lightbulb, new_feature: PlusCircle }
export default function TypeIcon({ type, size = 18 }) {
  const I = ICONS[type] || Bug
  return <I size={size} weight="duotone" aria-hidden="true" />
}
