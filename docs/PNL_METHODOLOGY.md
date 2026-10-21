# PnL methodology (v1)

## Supported scope

ETH-denominated, one-token NFT (`ERC-721` style) buy, mint, and sell events on Ethereum, Base, and Arbitrum. The app does not infer trades from transfers. Manual events have an amount and explicit fee in ETH. Reservoir activity events have a verified ETH/native or WETH price but **unknown gas/transaction fees**; `feeKnown: false` preserves that fact. Decimal.js is used for monetary arithmetic; JavaScript binary floats are used only to render chart coordinates.

Robinhood Chain and Arc are network configuration options only. Neither is included in PnL or manual CSV because no compatible NFT activity adapter has been verified. Arc uses USDC for gas, so its amounts must not be represented as ETH.

## Matching and formulas

Events sort by ISO timestamp then event ID. Position identity is chain + contract + token ID + wallet. If contract is absent, the collection name substitutes as a weaker identity. A buy or mint records `cost = amount + acquisition fee`. A sell closes the position. `net proceeds = sale amount − sale fee`; `realized PnL = net proceeds − cost`. All quantities remain ETH strings until display rounding.

A sale without a preceding matched acquisition has **unknown cost basis** and **unknown realized PnL**. Its proceeds are never counted as profit. When a matched acquisition or sale has `feeKnown: false`, the gross-minus-known-fees result is explicitly an **estimate**, not verified net PnL. A second acquisition of the same token before sale is treated as an added cost, so ERC-1155 quantities and multiple inventory lots are not supported. Cross-wallet movements are not matched.

The time filter selects event dates for visible totals and sales. Purchases before the window still supply cost basis for sales inside it. “Win rate” uses matched sales with strictly positive or negative realized PnL; break-even sales are excluded from the denominator. Volume shown is displayed acquisition spending plus net sale proceeds; this is a product convention, not an exchange volume definition. Open positions have no unrealized value without a reliable current price.

## Limitations

No USD conversion, gas paid by separate transactions, royalties beyond an entered fee, marketplace rebates, floor-price estimates, ERC-1155 quantities, bridging, lending, tax lot election, or tax reporting. Unsupported ERC-20 payments and missing prices are excluded and mark scan coverage partial. Provider page cap is 25 pages of 20 activities, so older history may be absent. User-entered data accuracy determines output accuracy. The numbers are estimates, not financial or tax advice.
