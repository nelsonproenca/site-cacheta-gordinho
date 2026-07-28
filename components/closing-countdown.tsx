"use client";

import { useEffect, useState } from "react";

// HH:MM while an hour or more remains, switching to MM:SS under an hour —
// avoids ticking hours:minutes:seconds for a 2-day window while still giving
// second-level precision as the deadline actually approaches.
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ClosingCountdown({
  closesAt,
  size = "sm",
}: {
  closesAt: string;
  // "lg" renders as a big card-stat-style number (see .card-stat in
  // globals.css) for the public Cachetão page, where players need to spot at
  // a glance whether registration is still open — "sm" is the compact inline
  // text used in the admin listing/detail cards.
  size?: "sm" | "lg";
}) {
  // Starts null so the server-rendered markup and the client's first paint
  // agree (empty) — filling in the real value only after mount avoids a
  // hydration mismatch from the server and client clocks disagreeing.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(closesAt).getTime();
    const tick = () => setRemaining(target - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [closesAt]);

  if (remaining === null) return null;

  if (remaining <= 0) {
    return size === "lg" ? (
      <div className="card-value text-red">Encerrando…</div>
    ) : (
      <span className="mono-data text-red">Encerrando…</span>
    );
  }

  if (size === "lg") {
    return <div className="card-value">{formatCountdown(remaining)}</div>;
  }

  return (
    <span className="mono-data">
      {formatCountdown(remaining)} para encerrar as inscrições
    </span>
  );
}
