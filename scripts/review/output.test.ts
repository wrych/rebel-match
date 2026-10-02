import { describe, expect, it } from 'vitest'
import { readOutput } from './output.js'

const finding = {
  category: 'style',
  rule: 'constitution §3',
  file: 'src/app.ts',
  line: 1,
  summary: 's',
  failure: 'f',
}

describe('readOutput', () => {
  it('returns the structured findings', () => {
    const stdout = JSON.stringify({
      is_error: false,
      structured_output: { findings: [finding] },
    })

    expect(readOutput(stdout)).toEqual({ findings: [finding] })
  })

  it('treats an empty findings list as a pass, not a failure', () => {
    const stdout = JSON.stringify({ structured_output: { findings: [] } })

    expect(readOutput(stdout)).toEqual({ findings: [] })
  })

  it('fails, with the reason, when the run reports an error', () => {
    const stdout = JSON.stringify({ is_error: true, result: 'rate limited' })

    expect(readOutput(stdout)).toEqual({
      failure: 'it reported an error: rate limited',
    })
  })

  it('fails when there is no structured output, rather than passing', () => {
    const stdout = JSON.stringify({ result: 'looks fine to me' })

    expect(readOutput(stdout)).toEqual({
      failure: 'it returned no structured findings',
    })
  })

  it('fails when the output is not JSON', () => {
    expect(readOutput('Error: not logged in')).toEqual({
      failure: 'its output was not JSON',
    })
  })
})
