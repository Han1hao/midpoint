CREATE SCHEMA IF NOT EXISTS portal;

CREATE TABLE IF NOT EXISTS portal.governance_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  migrated_from_json_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE portal.governance_state IS
  'Portal governance, asset, synchronization, review and license state stored in PostgreSQL';
