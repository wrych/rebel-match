import { once } from 'node:events'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { connect, type Connection } from './connect.js'

function message(type: string, body: string | Buffer): Buffer {
  const content = Buffer.from(body)
  const length = Buffer.alloc(4)
  length.writeInt32BE(content.length + 4)
  return Buffer.concat([Buffer.from(type), length, content])
}

const admitted = Buffer.concat([
  message('R', Buffer.alloc(4)),
  message('Z', 'I'),
])
const answered = Buffer.concat([message('C', 'COMMIT\0'), message('Z', 'I')])

interface FakeServer {
  url: string
  hangUp(): void
  stop(): Promise<unknown>
}

/** Just enough of a Postgres server to admit a client and answer its simple
 * queries, and to hang up on it as Cloud SQL does to an idle connection. */
async function fakeServer(): Promise<FakeServer> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    let started = false
    socket.on('data', () => {
      socket.write(started ? answered : admitted)
      started = true
    })
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    url: `postgres://rebel@127.0.0.1:${String(port)}/rebel_match`,
    hangUp: () => {
      sockets.forEach((socket) => socket.destroy())
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  }
}

let server: FakeServer
let connection: Connection

afterEach(async () => {
  await connection.close()
  await server.stop()
})

describe('a Postgres connection', () => {
  it('reports an idle connection the server closed, and opens another', async () => {
    server = await fakeServer()
    let reportLoss: (error: Error) => void = () => undefined
    const lost = new Promise<Error>((resolve) => (reportLoss = resolve))
    connection = await connect(
      { kind: 'postgres', url: server.url },
      (error) => {
        reportLoss(error)
      },
    )
    await connection.runScript('')

    server.hangUp()

    expect((await lost).message).toBe('Connection terminated unexpectedly')
    await expect(connection.runScript('')).resolves.toBeUndefined()
  })
})
