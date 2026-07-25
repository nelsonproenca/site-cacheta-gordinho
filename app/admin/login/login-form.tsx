"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthActionState } from "@/lib/actions/auth";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function LoginForm({
  initialError,
  streamers,
}: {
  initialError?: string | null;
  streamers: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [userType, setUserType] = useState<"" | "streamer" | "moderador">("");
  const action = mode === "login" ? signIn : signUp;
  const initialState: AuthActionState = initialError ? { error: initialError } : null;
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(action, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-5">
      {mode === "signup" && (
        <>
          <Field label="Nome" htmlFor="name">
            <Input id="name" name="name" type="text" required placeholder="Seu nome" />
          </Field>
          <Field label="Tipo de usuário" htmlFor="user_type">
            <Select
              id="user_type"
              name="user_type"
              required
              value={userType}
              onChange={(e) => setUserType(e.target.value as typeof userType)}
            >
              <option value="" disabled>
                Selecione
              </option>
              <option value="streamer">Streamer</option>
              <option value="moderador">Moderador</option>
            </Select>
          </Field>
          {userType === "moderador" &&
            (streamers.length > 0 ? (
              <Field label="Vinculado ao streamer" htmlFor="streamer_id">
                <Select id="streamer_id" name="streamer_id" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  {streamers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-ink-dim text-sm">Nenhum streamer disponível ainda.</p>
            ))}
        </>
      )}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required placeholder="voce@exemplo.com" />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" required minLength={6} />
      </Field>

      {state && "error" in state && <p className="error-text">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green">{state.success}</p>}

      <Button
        type="submit"
        disabled={pending || (mode === "signup" && userType === "moderador" && streamers.length === 0)}
      >
        {mode === "login" ? "Entrar" : "Criar conta"}
      </Button>

      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
      </button>
    </form>
  );
}
