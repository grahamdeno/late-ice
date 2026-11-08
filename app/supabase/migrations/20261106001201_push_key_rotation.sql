-- The push signing keys (VAPID) were rotated. Subscriptions made with the old public key can't
-- receive anything signed with the new one, so clear them. Each person turns notifications back
-- on in Settings, which subscribes with the new key.
delete from push_subscriptions;
