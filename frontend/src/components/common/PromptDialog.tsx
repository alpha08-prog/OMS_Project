import { createContext, useContext, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type PromptOptions = {
  title?: string;
  description?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
};

/** Resolves to the entered text on submit, or `null` if the user cancels. */
type PromptFn = (options?: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

/**
 * Promise-based, styled replacement for the native `window.prompt()`.
 *
 *   const prompt = usePrompt();
 *   const reason = await prompt({ title: "Reason for rejection", confirmText: "Reject" });
 *   if (reason === null) return; // cancelled
 *
 * Matches native prompt() semantics: `null` on cancel, the (possibly empty)
 * string on submit. Requires <PromptProvider> mounted near the app root.
 */
export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within <PromptProvider>");
  return ctx;
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions>({});
  const [value, setValue] = useState("");
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const prompt: PromptFn = (opts = {}) => {
    setOptions(opts);
    setValue(opts.defaultValue ?? "");
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  };

  const settle = (result: string | null) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) settle(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options.title ?? "Enter a value"}</DialogTitle>
            {options.description && (
              <DialogDescription>{options.description}</DialogDescription>
            )}
          </DialogHeader>
          <Textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={options.placeholder}
            className="min-h-[90px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(null)}>
              {options.cancelText ?? "Cancel"}
            </Button>
            <Button onClick={() => settle(value)}>
              {options.confirmText ?? "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PromptContext.Provider>
  );
}
