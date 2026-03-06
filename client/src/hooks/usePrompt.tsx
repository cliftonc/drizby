import { useState, useCallback, type ReactNode } from 'react'
import { PromptModal } from '../components/Modal'

interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  submitText?: string
}

/**
 * Hook that returns a `prompt()` function and a `<PromptDialog />` element.
 * Returns the entered string, or null if cancelled.
 *
 * Usage:
 *   const [prompt, PromptDialog] = usePrompt()
 *   const name = await prompt({ title: 'File name' })
 *   // render <PromptDialog /> in JSX
 */
export function usePrompt(): [(options: PromptOptions) => Promise<string | null>, () => ReactNode] {
  const [state, setState] = useState<{
    options: PromptOptions
    resolve: (value: string | null) => void
  } | null>(null)

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({ options, resolve })
    })
  }, [])

  const handleClose = useCallback(() => {
    state?.resolve(null)
    setState(null)
  }, [state])

  const handleSubmit = useCallback((value: string) => {
    state?.resolve(value)
    setState(null)
  }, [state])

  const Dialog = useCallback(() => {
    if (!state) return null
    return (
      <PromptModal
        isOpen
        onClose={handleClose}
        onSubmit={handleSubmit}
        title={state.options.title}
        message={state.options.message}
        placeholder={state.options.placeholder}
        defaultValue={state.options.defaultValue}
        submitText={state.options.submitText}
      />
    )
  }, [state, handleClose, handleSubmit])

  return [prompt, Dialog]
}
