/**
 * Where this Dort lives. Canonical links, the sitemap, robots.txt and the social cards point
 * here. There is no public deploy to fall back to, so a build that does not set NEXT_PUBLIC_URL
 * is a local one and says so — better a canonical that names localhost than one that points at
 * a site this project does not control.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_URL || "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "Dort";
export const SITE_TITLE = "Dort: See what your smart contract actually does";
export const SITE_DESCRIPTION =
  "Dort is a defensive tool for smart contract auditors and bug bounty hunters: decoded Foundry traces, your contract as a graph, scenario tests exported as .t.sol, and Slither and Aderyn findings merged in one place.";

export { LOCAL_APP } from "@/features/ai/utils/provider";
