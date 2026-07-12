import { createContext, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as destructive (red). */
  destructive?: boolean;
};

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based, styled replacement for the native `window.confirm()`.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this task?", destructive: true }))) return;
 *   await taskApi.delete(id);
 *
 * Requires <ConfirmProvider> mounted once near the app root (see main.tsx).
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm: ConfirmFn = (opts = {}) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  };

  const settle = (result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title ?? "Are you sure?"}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {options.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={options.destructive ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {options.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
