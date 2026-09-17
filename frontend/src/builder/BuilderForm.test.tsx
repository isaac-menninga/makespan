import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { BuilderForm, createEmptyDraft } from './BuilderForm'
import type { BuilderDraft } from './types'

function renderBuilderForm(overrides: Partial<Parameters<typeof BuilderForm>[0]> = {}) {
  const initialDraft = overrides.initialDraft ?? createEmptyDraft()
  const onSave = vi.fn()
  render(
    <MemoryRouter>
      <BuilderForm
        initialDraft={initialDraft}
        savedDraft={initialDraft}
        onBack={vi.fn()}
        onSave={onSave}
        isSaving={false}
        {...overrides}
      />
    </MemoryRouter>,
  )
  return { onSave }
}

function draftWithTwoMachines(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [
      { id: 'm1', name: 'M1' },
      { id: 'm2', name: 'M2' },
    ],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('BuilderForm', () => {
  it('renders the seeded empty draft with one machine and one job', () => {
    renderBuilderForm()
    expect(screen.getAllByLabelText('Machine name')).toHaveLength(1)
    expect(screen.getAllByLabelText('Duration')).toHaveLength(1)
  })

  it('adds a machine', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    await user.click(screen.getByText('+ Add Machine'))
    expect(screen.getAllByLabelText('Machine name')).toHaveLength(2)
  })

  it('disables removing a machine that is in use', () => {
    renderBuilderForm({ initialDraft: draftWithTwoMachines(), savedDraft: draftWithTwoMachines() })
    const removeButtons = screen.getAllByText('Remove').filter((el) => el.tagName === 'BUTTON')
    expect(removeButtons[0]).toBeDisabled() // M1, referenced by the only operation
  })

  it('disables removing the last operation in a job', () => {
    renderBuilderForm()
    const removeOperationButton = screen.getByLabelText('Duration').closest('div')!
    expect(within(removeOperationButton).getByText('Remove')).toBeDisabled()
  })

  it('disables removing the last job', () => {
    renderBuilderForm()
    expect(screen.getByText('Remove Job')).toBeDisabled()
  })

  it('adds and removes a job', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    await user.click(screen.getByText('+ Add Job'))
    expect(screen.getAllByText('Remove Job')).toHaveLength(2)
    await user.click(screen.getAllByText('Remove Job')[1])
    expect(screen.getAllByText('Remove Job')).toHaveLength(1)
  })

  it('disables Save when the draft is invalid, enables it once fixed', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    expect(screen.getByText('Save')).toBeDisabled() // machine name is empty by default

    await user.type(screen.getByLabelText('Machine name'), 'M1')
    expect(screen.getByText('Save')).not.toBeDisabled()
  })

  it('calls onSave with the current draft when Save is clicked', async () => {
    const user = userEvent.setup()
    const { onSave } = renderBuilderForm({
      initialDraft: draftWithTwoMachines(),
      savedDraft: draftWithTwoMachines(),
    })
    await user.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Demo' }))
  })

  it('enables the weight input only once a due date is set', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    expect(screen.getByLabelText('Weight')).toBeDisabled()
    await user.type(screen.getByLabelText('Due date'), '5')
    expect(screen.getByLabelText('Weight')).not.toBeDisabled()
  })

  it('renders problem-level errors passed in via saveErrors', () => {
    renderBuilderForm({
      saveErrors: {
        isValid: false,
        problemErrors: ['Something went wrong on the server.'],
        machineErrors: {},
        jobErrors: {},
      },
    })
    expect(screen.getByText('Something went wrong on the server.')).toBeInTheDocument()
  })
})
