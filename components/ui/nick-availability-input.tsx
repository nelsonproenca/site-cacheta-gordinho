"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/ui/field";

// specs/002-moedas-pagamento-indicacao, US4 — verificação de disponibilidade
// de nick em tempo real, debounced, via a função stable is_handle_available
// (leitura pública simples, sem precisar de Server Action a cada tecla —
// research.md §5).
export function NickAvailabilityInput({
  name,
  defaultValue = "",
  required = true,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  // Só a checagem assíncrona (dentro do setTimeout) chama setState — nenhum
  // setState síncrono no corpo do efeito (react-hooks/set-state-in-effect).
  // "checking"/"idle" são derivados na renderização comparando `value` com o
  // último valor realmente checado, em vez de um estado próprio.
  const [checked, setChecked] = useState<{ value: string; available: boolean } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!value.trim()) return;
    timeoutRef.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("is_handle_available", { p_handle: value });
      setChecked({ value, available: !!data });
    }, 400);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value]);

  const status: "idle" | "checking" | "available" | "taken" = !value.trim()
    ? "idle"
    : checked?.value !== value
      ? "checking"
      : checked.available
        ? "available"
        : "taken";

  return (
    <Field
      label="Nick"
      htmlFor={name}
      hint={
        status === "checking"
          ? "Verificando..."
          : status === "available"
            ? "✓ Nick disponível"
            : status === "taken"
              ? "Esse nick já está em uso"
              : undefined
      }
    >
      <Input
        id={name}
        name={name}
        type="text"
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ex: cacheteiro_pro"
      />
    </Field>
  );
}
