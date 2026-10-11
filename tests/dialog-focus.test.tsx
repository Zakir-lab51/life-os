// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

/*
  Regression: LIFE OS opens its dialogs from buttons that aren't Radix Triggers (the top
  bar, menus, shortcuts). Radix only returns focus to its own Trigger, so on close focus
  used to fall to <body>. Each dialog type must hand focus back to whatever opened it.
*/

afterEach(cleanup)

function Harness({ kind }: { kind: "dialog" | "alert" | "sheet" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {kind === "dialog" && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Body</DialogDescription>
            <button type="button">Inside</button>
          </DialogContent>
        </Dialog>
      )}
      {kind === "alert" && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogDescription>Body</AlertDialogDescription>
            <AlertDialogCancel>Inside</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {kind === "sheet" && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription>Body</SheetDescription>
            <button type="button">Inside</button>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

describe("dialogs give focus back to whatever opened them", () => {
  for (const kind of ["dialog", "alert", "sheet"] as const) {
    it(`${kind}: Escape returns focus to the opener`, async () => {
      render(<Harness kind={kind} />)
      const opener = screen.getByRole("button", { name: "Open" })
      act(() => opener.focus())
      fireEvent.click(opener)
      await screen.findByText("Body")
      await waitFor(() => expect(document.activeElement).not.toBe(opener))
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
      await waitFor(() => expect(screen.queryByText("Body")).toBeNull())
      await waitFor(() => expect(document.activeElement).toBe(opener))
    })
  }

  it("leaves focus alone when the opener has gone", async () => {
    function Vanishing() {
      const [open, setOpen] = useState(false)
      const [shown, setShown] = useState(true)
      return (
        <>
          {shown && (
            <button
              type="button"
              onClick={() => {
                setOpen(true)
                setShown(false)
              }}
            >
              Open
            </button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Body</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Vanishing />)
    const opener = screen.getByRole("button", { name: "Open" })
    act(() => opener.focus())
    fireEvent.click(opener)
    await screen.findByText("Body")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("Body")).toBeNull())
    expect(opener.isConnected).toBe(false)
  })
})
