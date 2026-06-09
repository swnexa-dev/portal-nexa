import { createApp } from './app.js'
import { connectToDatabase } from './db/connect.js'
import { env } from './config/env.js'

async function bootstrap() {
  await connectToDatabase()
  const app = createApp()
  app.listen(env.port, () => {
    console.log(`Nexa API online na porta ${env.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar backend Nexa', error)
  process.exit(1)
})
