"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addParticipant, type ActionState } from "@/lib/actions/lives";
import { searchPlayers } from "@/lib/actions/players";
import { normalizeHandle } from "@/lib/utils";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type PlayerHit = { id: string; display_name: string; tiktok_handle: string };
type MenuRect = { top: number; left: number; width: number };

export function AddParticipantForm({ sessionId, accountId }: { sessionId: string; accountId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addParticipant, null);
  const [formKey, setFormKey] = useState(0);
  const [handle, setHandle] = useState("");
  const [results, setResults] = useState<PlayerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlayerHit | null>(null);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      setFormKey((k) => k + 1);
      setHandle("");
      setSelected(null);
      setResults([]);
    }
  }

  useEffect(() => {
    const normalized = normalizeHandle(handle);
    if (normalized.length < 2) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const hits = await searchPlayers(normalized);
      if (!cancelled) setResults(hits);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [handle]);

  const normalizedHandle = normalizeHandle(handle);
  const isNew = normalizedHandle.length >= 2 && !results.some((r) => r.tiktok_handle === normalizedHandle);
  const showMenu = open && normalizedHandle.length >= 2;

  // The dropdown is portaled to <body> and fixed-positioned from the input's
  // rect — the card it lives in has overflow:hidden (to clip its rounded-corner
  // accent bar), which would otherwise clip the dropdown too.
  useEffect(() => {
    if (!showMenu) return;
    const updateRect = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 256) });
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [showMenu, results.length]);

  return (
    <form key={formKey} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="account_id" value={accountId} />
      <div className="flex flex-col gap-2 flex-1 min-w-[160px]">
        <label htmlFor="tiktok_handle" className="caption">
          @tiktok
        </label>
        <Input
          ref={inputRef}
          id="tiktok_handle"
          name="tiktok_handle"
          type="text"
          required
          autoComplete="off"
          placeholder="usuario"
          className="w-full"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {showMenu &&
          menuRect &&
          createPortal(
            <div
              className="fixed z-50 rounded-[6px] border border-stroke bg-surface-2 shadow-lg overflow-hidden"
              style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
            >
              {results.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-carbon"
                  onMouseDown={() => {
                    setHandle(r.tiktok_handle);
                    setSelected(r);
                    setOpen(false);
                  }}
                >
                  {r.display_name} <span className="text-ink-dim">@{r.tiktok_handle}</span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="px-3 py-2 text-xs text-ink-dim">
                  Nenhum jogador encontrado. Preencha o nome para cadastrar @{normalizedHandle}.
                </div>
              )}
            </div>,
            document.body,
          )}
      </div>
      <div className="flex flex-col gap-2 flex-1 min-w-[160px]">
        <label htmlFor="display_name" className="caption">
          Nome {isNew ? "(novo jogador)" : "(se novo)"}
        </label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          placeholder={selected ? selected.display_name : "opcional"}
          className="w-full"
          disabled={!!selected}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="flex-1 min-w-[160px]">
        Adicionar à live
      </Button>
      {state && "error" in state && <p className="error-text w-full">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green w-full">{state.success}</p>}
    </form>
  );
}
