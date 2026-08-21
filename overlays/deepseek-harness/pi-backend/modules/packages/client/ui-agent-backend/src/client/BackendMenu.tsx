import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentBackendOption } from './store.ts'

/** Shared backend picker used by the General row. */
export function BackendMenu({
  options, selectedId, label, disabled, open, align, buttonClassName, chevronClassName, onOpenChange, onSelect,
}: {
  options: readonly AgentBackendOption[]
  selectedId: string | undefined
  label: string
  disabled: boolean
  open: boolean
  align: 'start' | 'end'
  buttonClassName: string | undefined
  chevronClassName: string | undefined
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
}) {
  /* jscpd:ignore-start -- settings pickers deliberately share the same Menu
     trigger, dismissal, selection, and accessibility contract. */
  return (
    <Menu
      open={open}
      onClose={() => { onOpenChange(false) }}
      items={options.map(option => ({ id: option.id, label: option.name }))}
      selectedId={selectedId}
      onSelect={(id) => { onOpenChange(false); onSelect(id) }}
      align={align}
      portal
      anchor={(
        <button
          type="button"
          className={buttonClassName}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => { onOpenChange(!open) }}
        >
          {label}
          <IconChevronDownOutline14 className={chevronClassName} />
        </button>
      )}
    />
  )
  /* jscpd:ignore-end */
}
