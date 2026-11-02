/**
 * The slices of PortalSwapRouter, its factory and its pairs that the page calls.
 *
 * Checked against the live deployment on Portaldot V3 before being written down: the router has
 * `WPOT()` where a Uniswap V2 clone would have `WETH()`, and it has no
 * `…SupportingFeeOnTransferTokens` variant at all, so neither is listed here.
 */
export const ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactPOTForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForPOT",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "WPOT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [
      { name: "a", type: "address" },
      { name: "b", type: "address" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
