// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { DiscardBar, useCloseGuard, useUnsaved, type CloseGuard } from "@/components/os/editor-guard"
import { Field } from "@/components/os/field"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

/*
  Regression: pressing Escape, clicking outside or ✕ in an editor closed it and threw away
  unsaved typing. Editors now ask first; saving, Cancel and Discard still close at once.
*/

afterEach(cleanup)

function Form({ guard }: { guard: CloseGuard }) {
  const [title, setTitle] = useState("")
  useUnsaved(guard, { title })
  return (
    <form className="relative">
      <Field label="Title" htmlFor="t">
        <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <button type="button" onClick={guard.close}>
        Cancel
      </button>
      <DiscardBar guard={guard} />
    </form>
  )
}

function Editor() {
  const [open, setOpen] = useState(true)
  const guard = useCloseGuard(() => setOpen(false))
  return (
    <Dialog open={open} onOpenChange={(o) => !o && guard.requestClose()}>
      <DialogContent>
        <DialogTitle>Edit</DialogTitle>
        <DialogDescription>Test editor</DialogDescription>
        <Form guard={guard} />
      </DialogContent>
    </Dialog>
  )
}

const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
const isOpen = () => screen.queryByRole("dialog") !== null

describe("editor close guard", () => {
  it("closes at once when nothing changed", () => {
    render(<Editor />)
    escape()
    expect(isOpen()).toBe(false)
  })

  it("asks before throwing away typing, and keeps editing on request", () => {
    render(<Editor />)
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Buy milk" } })
    escape()
    expect(isOpen()).toBe(true)
    expect(screen.getByText("Discard your changes?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.queryByText("Discard your changes?")).toBeNull()
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Buy milk")
  })

  it("closes on Discard, and on Cancel without asking", () => {
    render(<Editor />)
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Buy milk" } })
    escape()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(isOpen()).toBe(false)

    cleanup()
    render(<Editor />)
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Buy milk" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(isOpen()).toBe(false)
  })

  it("stops asking once the change is undone", () => {
    render(<Editor />)
    const input = screen.getByLabelText("Title")
    fireEvent.change(input, { target: { value: "x" } })
    fireEvent.change(input, { target: { value: "" } })
    escape()
    expect(isOpen()).toBe(false)
  })
})

describe("Field", () => {
  it("links its control to the error, marks itself invalid, and links the hint otherwise", () => {
    const { rerender, container } = render(
      <Field label="Due" htmlFor="due" hint="Optional">
        <input id="due" />
      </Field>,
    )
    const input = screen.getByLabelText("Due")
    expect(input.getAttribute("aria-describedby")).toBe("due-hint")
    expect(input.getAttribute("aria-invalid")).toBeNull()
    rerender(
      <Field label="Due" htmlFor="due" hint="Optional" error="Pick a date">
        <input id="due" />
      </Field>,
    )
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")).toBe("due-error")
    expect(document.getElementById("due-error")?.textContent).toBe("Pick a date")
    expect(container.querySelector("[data-invalid]")).not.toBeNull()
  })
})
