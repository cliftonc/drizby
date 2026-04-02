/**
 * AI provider abstraction — calls configured AI provider to generate text.
 * Extracted from schema-files.ts for reuse by metabase-import and other routes.
 */

export interface AISettings {
  provider?: string
  apiKey?: string
  model?: string
  baseUrl?: string
}

/**
 * Call configured AI provider to generate text.
 */
export async function callAI(
  ai: AISettings,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (ai.provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ai.apiKey })
    const stream = await client.messages.stream({
      model: ai.model || 'claude-sonnet-4-6',
      max_tokens: 32768,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const response = await stream.finalMessage()
    const textBlock = response.content.find((b: any) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from AI')
    return extractCodeBlock(textBlock.text)
  }

  if (ai.provider === 'openai') {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: ai.apiKey, ...(ai.baseUrl && { baseURL: ai.baseUrl }) })
    const response = await client.chat.completions.create({
      model: ai.model || 'gpt-4.1-mini',
      max_tokens: 32768,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    const text = response.choices[0]?.message?.content
    if (!text) throw new Error('No text response from AI')
    return extractCodeBlock(text)
  }

  if (ai.provider === 'google') {
    const model = ai.model || 'gemini-3.1-flash-lite-preview'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 32768, temperature: 0 },
      }),
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errText.substring(0, 200)}`)
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text)
      .join('\n')
    if (!text) throw new Error('No text response from AI')
    return extractCodeBlock(text)
  }

  throw new Error(`Unsupported AI provider: ${ai.provider}`)
}

/**
 * Extract code from markdown code blocks if present, otherwise return as-is.
 */
export function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:typescript|ts|json)?\s*\n([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}
