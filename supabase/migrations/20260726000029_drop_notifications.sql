-- The admin-to-admin notifications feature (20260724000026) never got a
-- caller beyond the header bell: notifyStreamer had no button wired to it
-- since the account-nested cross-streamer-section.tsx it was built for was
-- deleted when Partidas went global, so the table had nothing writing to it
-- and the bell was its only reader. Dropping both.
drop table public.notifications;
