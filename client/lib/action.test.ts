import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useAction } from './action'

const FAILURE = 'That did not go through. Try again.'

interface Step {
  promise: Promise<void>
  finish: () => void
  fail: () => void
}

function step(): Step {
  const ends = { finish: (): void => undefined, fail: (): void => undefined }
  const promise = new Promise<void>((resolve, reject) => {
    ends.finish = resolve
    ends.fail = () => reject(new Error('refused'))
  })
  return { promise, ...ends }
}

describe('useAction', () => {
  it('is busy while the body runs, and not before or after', async () => {
    const action = useAction(ref(null))
    const body = step()
    expect(action.busy.value).toBe(false)

    const running = action.run(() => body.promise, FAILURE)
    expect(action.busy.value).toBe(true)

    body.finish()
    await running
    expect(action.busy.value).toBe(false)
  })

  it('keeps what a body that finishes showed', async () => {
    const message = ref<string | null>(null)
    const action = useAction(message)

    await action.run(async () => {
      message.value = 'Saved.'
    }, FAILURE)

    expect(message.value).toBe('Saved.')
  })

  it('leaves an earlier message alone while the body runs and after it finishes', async () => {
    const message = ref<string | null>('Earlier.')
    const action = useAction(message)
    const body = step()

    const running = action.run(() => body.promise, FAILURE)
    expect(message.value).toBe('Earlier.')
    body.finish()
    await running

    expect(message.value).toBe('Earlier.')
  })

  it('shows the failure text when the body throws, and is busy no longer', async () => {
    const message = ref<string | null>('Earlier.')
    const action = useAction(message)
    const body = step()

    const running = action.run(() => body.promise, FAILURE)
    body.fail()
    await running

    expect(message.value).toBe(FAILURE)
    expect(action.busy.value).toBe(false)
  })

  it('replaces what a body showed before it threw', async () => {
    const message = ref<string | null>(null)
    const action = useAction(message)

    await action.run(async () => {
      message.value = 'Half done.'
      throw new Error('refused')
    }, FAILURE)

    expect(message.value).toBe(FAILURE)
  })
})
