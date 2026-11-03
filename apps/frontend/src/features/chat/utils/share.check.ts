// node --experimental-strip-types src/features/chat/utils/share.check.ts
import assert from "node:assert/strict";
import { SHARE_TITLE, shareText, shareUrl } from "./share.ts";

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

console.log("share ok");
