"use client";

import { useEffect, useState } from "react";

// Mesmo padrão hidration-safe de components/closing-countdown.tsx (início em
// null, setInterval, cleanup no unmount) — variante curta em segundos para o
// timer de 15s por turno, a partir de cacheta_tables.turn_deadline_at. Ao
// zerar, chama onExpire (que o chamador liga a uma chamada de expire_turn).
export function TurnTimer({
  deadline,
  isMyTurn,
  onExpire,
}: {
  deadline: string | null;
  isMyTurn: boolean;
  onExpire: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const target = deadline ? new Date(deadline).getTime() : null;
    let firedExpire = false;
    const tick = () => {
      if (target === null) {
        setRemainingMs(null);
        return;
      }
      const ms = target - Date.now();
      setRemainingMs(ms);
      if (ms <= 0 && !firedExpire) {
        firedExpire = true;
        onExpire();
      }
    };
    tick();
    if (target === null) return;
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  if (remainingMs === null) return null;

  const seconds = Math.max(Math.ceil(remainingMs / 1000), 0);

  return (
    <span className={`mono-data ${seconds <= 5 ? "text-red" : ""}`}>
      {isMyTurn ? "Sua vez — " : ""}
      {seconds}s
    </span>
  );
}
