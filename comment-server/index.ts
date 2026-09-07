import { Resend } from 'resend'
import { createApp } from './app'
import { readConfig } from './config'

const config = readConfig(process.env)
const resend = new Resend(config.apiKey)
const app = createApp({
  emailConfig: config.email,
  sendEmail: async (cmd) => {
    const { error } = await resend.emails.send({
      from: cmd.from,
      to: cmd.to,
      subject: cmd.subject,
      text: cmd.body,
    })
    if (error) throw new Error(error.message)
  },
})

export default { port: Number(process.env.PORT ?? 3007), fetch: app.fetch }
