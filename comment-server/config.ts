import type { EmailConfig } from './core'

type Config = { email: EmailConfig; apiKey: string }

/** Check configuration at startup; never include secret values in errors. */
export const readConfig = (env: Record<string, string | undefined>): Config => {
  const required = (name: string): string => {
    const value = env[name]
    if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`)
    return value
  }
  return {
    email: { from: required('COMMENT_FROM'), to: required('COMMENT_RECIPIENT') },
    apiKey: required('RESEND_API_KEY'),
  }
}
