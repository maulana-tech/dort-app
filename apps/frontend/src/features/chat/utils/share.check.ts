// node --experimental-strip-types src/features/chat/utils/share.check.ts
import assert from "node:assert/strict";
import {
  SHARE_BLURB,
  SHARE_TARGETS,
  SHARE_TITLE,
  shareText,
  shareUrl,
} from "./share.ts";

const U = "https://dort-app.vercel.app";

// the link lands on the page that does the reading, not on a marketing page someone has to
// then navigate out of
assert.equal(shareUrl(U), `${U}/chat`);
assert.equal(
  shareUrl(`${U}/`),
  `${U}/chat`,
  "a trailing slash is not a second path segment",
);
assert.equal(shareUrl("http://localhost:3000"), "http://localhost:3000/chat");

// the text says what a reader can do, and ends with the link so a client that strips rich
// previews still shows where it goes
const t = shareText(shareUrl(U));
assert.ok(t.endsWith(`${U}/chat`));
assert.match(t, /transaction hash/);
assert.match(t, /\.sol/);
assert.match(
  t,
  /what it could not check/,
  "the promise travels with the invitation",
);
assert.ok(
  t.length < 280,
  `a link that cannot be posted is not shareable: ${t.length}`,
);

// nothing here offers a reward, because nothing here can tell whether a share happened
assert.doesNotMatch(t, /credit|reward|earn|bonus|invite|ref=/i);
assert.equal(SHARE_TITLE, "Dort");

// ── the networks ───────────────────────────────────────────────────────────────────────────
const link = shareUrl(U);
assert.ok(SHARE_TARGETS.length > 0, "there is somewhere to share to");
assert.equal(
  new Set(SHARE_TARGETS.map((t) => t.id)).size,
  SHARE_TARGETS.length,
  "two targets cannot share an id",
);

for (const target of SHARE_TARGETS) {
  const href = target.href(link);
  const parsed = new URL(href);

  // a compose window is somebody else's site: it goes over https, to the host we meant
  assert.equal(parsed.protocol, "https:", `${target.id} is not https`);
  assert.doesNotMatch(
    parsed.host,
    /^(localhost|127\.|\[)/,
    `${target.id} points at this machine`,
  );

  // the link has to survive the trip, encoded, so a query string in it cannot truncate the share
  assert.ok(
    href.includes(encodeURIComponent(link)),
    `${target.id} does not carry the link, encoded`,
  );
  assert.ok(
    !href.includes(`=${link}`),
    `${target.id} pastes the link raw, so anything after a & in it would be lost`,
  );

  // nothing of ours rides along. A share cannot be verified, so a tracking parameter here would
  // only ever identify the reader who pressed it (the note at the top of share.ts).
  assert.doesNotMatch(
    href,
    /[?&](utm_[a-z]+|ref|referral|campaign|aff)=/i,
    `${target.id} carries a tracking parameter`,
  );

  // X counts the text against 280 with the url folded in at its own length
  if (target.id === "x")
    assert.ok(
      SHARE_BLURB.length + 24 < 280,
      "the blurb plus a t.co link must fit in a post",
    );
}

// the blurb is the text without the link, and shareText is the two joined — one source, so an
// edit cannot reach the clipboard and miss every network
assert.ok(
  !SHARE_BLURB.includes("http"),
  "the blurb carries no link of its own",
);
assert.equal(shareText(link), `${SHARE_BLURB} ${link}`);

console.log(`share ok (${SHARE_TARGETS.length} targets)`);
