# PnL methodology (v1)

## Supported scope

ETH-denominated, one-token NFT (`ERC-721` style) buy, mint, and sell events on Ethereum, Base, and Arbitrum. The app does not infer trades from transfers. Each event has an amount and explicit fee in ETH. Decimal.js is used for monetary arithmetic; JavaScript binary floats are used only to render chart coordinates.

## Matching and formulas

Events sort by ISO timestamp then event ID. Position identity is chain + contract + token ID + wallet. If contract is absent, the collection name substitutes as a weaker identity. A buy or mint records `cost = amount + acquisition fee`. A sell closes the position. `net proceeds = sale amount − sale fee`; `realized PnL = net proceeds − cost`. All quantities remain ETH strings until display rounding.

A sale without a preceding matched acquisition has **unknown cost basis** and **unknown realized PnL**. Its proceeds are never counted as profit. A second acquisition of the same token before sale is treated as an added cost, so ERC-1155 quantities and multiple inventory lots are not supported. Cross-wallet movements are not matched.

The time filter selects event dates for visible totals and sales. Purchases before the window still supply cost basis for sales inside it. “Win rate” uses matched sales with strictly positive or negative realized PnL; break-even sales are excluded from the denominator. Volume shown is displayed acquisition spending plus net sale proceeds; this is a product convention, not an exchange volume definition. Open positions have no unrealized value without a reliable current price.

## Limitations

No USD conversion, gas paid by separate transactions, royalties beyond an entered fee, marketplace rebates, floor-price estimates, ERC-1155 quantities, bridging, lending, tax lot election, or tax reporting. Provider coverage may be partial and is labelled as such. User-entered data accuracy determines output accuracy. The numbers are estimates, not financial or tax advice.
