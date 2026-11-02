-- Schema for the shared bill splitter.
-- Every constraint is named so a failure points straight at the rule that was broken.
-- Money is always stored as whole cents in INTEGER columns.

CREATE TABLE homes (
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT pk_homes PRIMARY KEY (id),
  CONSTRAINT ck_homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  id         TEXT NOT NULL,
  home_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  -- 1-based join order inside the home. Decides who gets the extra cents of a split.
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT pk_members PRIMARY KEY (id),
  CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  CONSTRAINT ck_members_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT ck_members_position_positive CHECK (typeof(position) = 'integer' AND position > 0),
  -- Two members of one home can never share a join position, so the order is always strict.
  CONSTRAINT uq_members_home_position UNIQUE (home_id, position)
);

CREATE TABLE bills (
  id          TEXT NOT NULL,
  home_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  CONSTRAINT pk_bills PRIMARY KEY (id),
  CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE,
  CONSTRAINT ck_bills_title_not_blank CHECK (length(trim(title)) > 0),
  -- typeof() stops SQLite's type affinity from silently storing 10.5 or '1000'.
  CONSTRAINT ck_bills_total_positive_integer CHECK (typeof(total_cents) = 'integer' AND total_cents > 0)
);

CREATE TABLE shares (
  id              TEXT NOT NULL,
  bill_id         TEXT NOT NULL,
  member_id       TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  paid_at         TEXT,
  idempotency_key TEXT,
  CONSTRAINT pk_shares PRIMARY KEY (id),
  CONSTRAINT fk_shares_bill FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
  -- A share can be 0 cents (e.g. 2 cents split between 3 members), but never negative.
  CONSTRAINT ck_shares_amount_non_negative CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  -- A member owes at most one share of a bill.
  CONSTRAINT uq_shares_bill_member UNIQUE (bill_id, member_id),
  -- A share is either unpaid (no time, no key) or paid (time and the key that paid it).
  CONSTRAINT ck_shares_paid_has_key CHECK ((paid_at IS NULL) = (idempotency_key IS NULL))
);

CREATE INDEX idx_bills_home ON bills (home_id, created_at);
CREATE INDEX idx_shares_member ON shares (member_id);
