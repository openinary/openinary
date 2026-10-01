-- Single-admin guard (port of the sqlite `prevent_multiple_users` trigger).
-- SECURITY: enforce a hard limit of a single user/admin at the database level,
-- closing any race-condition window where two sign-ups could occur
-- concurrently. The sqlite original was a BEFORE INSERT trigger with
-- `WHEN (SELECT COUNT(*) FROM user) >= 1` — before-insert semantics exclude
-- the new row. A pg CONSTRAINT TRIGGER runs deferred (at commit), when the
-- new row is already visible, so the equivalent bound is COUNT(*) > 1: the
-- first user commits with count = 1, any signup alongside an existing user
-- sees count = 2 and aborts. Deferred so better-auth's sign-up (user +
-- session + account in one transaction) is validated as a unit.
CREATE OR REPLACE FUNCTION prevent_multiple_users() RETURNS trigger AS $$
BEGIN
  IF (SELECT COUNT(*) FROM "user") > 1 THEN
    RAISE EXCEPTION 'Only one user account is allowed in this deployment'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER prevent_multiple_users
AFTER INSERT ON "user"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION prevent_multiple_users();

