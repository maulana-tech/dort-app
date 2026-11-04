/**
 * Where this Dort lives. Canonical links, the sitemap, robots.txt and the social cards point
 * here. The deploy sets NEXT_PUBLIC_URL; a build that does not is a local one and says so, which
 * is why the fallback is localhost rather than the public URL — better a canonical that names
 * this machine than one that tells search engines a local build is the real site.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "Dort";
export const SITE_TITLE = "Dort: See what your smart contract actually does";
export const SITE_DESCRIPTION =
  "Dort is a defensive tool for smart contract auditors and bug bounty hunters: hand it a transaction hash, a contract address or a Solidity file and it reads the chain's own call tree, decoded call by call, with an AI that explains and never decides.";

export { LOCAL_APP } from "@/features/ai/utils/provider";
