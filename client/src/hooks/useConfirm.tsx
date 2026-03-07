import { type ReactNode, useCallback, useState } from 'react'
import { ConfirmModal } from '../components/Modal'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

/**
 * Hook that returns a `confirm()` function and a `<ConfirmDialog />` element.
 * Render the dialog somewhere in your component tree, then call `confirm(options)`
 * which returns a Promise<boolean>.
 *
 * Usage:
 *   const [confirm, ConfirmDialog] = useConfirm()
 *   const ok = await confirm({ title: 'Delete?', message: '...' })
 *   // render <ConfirmDialog /> in JSX
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, () => ReactNode] {
  const [state, setState] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setState({ options, resolve })
    })
  }, [])

  const handleClose = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const Dialog = useCallback(() => {
    if (!state) return null
    return (
      <ConfirmModal
        isOpen
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={state.options.title}
        message={state.options.message}
        confirmText={state.options.confirmText}
        cancelText={state.options.cancelText}
        variant={state.options.variant}
      />
    )
  }, [state, handleClose, handleConfirm])

  return [confirm, Dialog]
}
