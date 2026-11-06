// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConfirmAction from './ConfirmAction.vue'

const labels = {
  triggerLabel: 'Delete…',
  confirmLabel: 'Delete',
  keepLabel: 'Keep',
}

function mountAction(
  props: Partial<InstanceType<typeof ConfirmAction>['$props']> = {},
  slots: Record<string, string> = {},
): ReturnType<typeof mount> {
  return mount(ConfirmAction, {
    props: { ...labels, busy: false, ...props },
    slots: { default: 'Delete it? This cannot be undone.', ...slots },
  })
}

describe('ConfirmAction', () => {
  it('shows only the trigger until it is pressed, then the warning', async () => {
    const action = mountAction()

    expect(action.find('[role="alert"]').exists()).toBe(false)
    await action.find('button').trigger('click')

    expect(action.find('[role="alert"]').text()).toBe(
      'Delete it? This cannot be undone.',
    )
    expect(action.find('button.btn-dark').text()).toBe('Delete')
    expect(action.emitted('update:open')).toEqual([[true]])
  })

  it('Keep closes the warning without confirming', async () => {
    const action = mountAction({ open: true })

    await action.find('button.btn-ghost').trigger('click')

    expect(action.emitted('update:open')).toEqual([[false]])
    expect(action.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm and stays open for the caller to close', async () => {
    const action = mountAction({ open: true })

    await action.find('button.btn-dark').trigger('click')

    expect(action.emitted('confirm')).toHaveLength(1)
    expect(action.find('[role="alert"]').exists()).toBe(true)
  })

  it('disables both answers while busy', () => {
    const action = mountAction({ open: true, busy: true })

    for (const button of action.findAll('button'))
      expect(button.attributes('disabled')).toBeDefined()
  })

  it('disables the trigger when asked', () => {
    const action = mountAction({ triggerDisabled: true })

    expect(action.find('button').attributes('disabled')).toBeDefined()
  })

  it('offers no trigger without a trigger label', () => {
    const action = mount(ConfirmAction, {
      props: { confirmLabel: 'Delete', keepLabel: 'Keep', busy: false },
    })

    expect(action.find('button').exists()).toBe(false)
  })

  it('wraps the trigger after the closed slot when given a closed class', () => {
    const action = mountAction(
      { closedClass: 'actions' },
      { closed: '<button class="other">Restore</button>' },
    )

    const wrap = action.find('div.actions')
    expect(wrap.findAll('button').map((b) => b.text())).toEqual([
      'Restore',
      'Delete…',
    ])
  })
})
