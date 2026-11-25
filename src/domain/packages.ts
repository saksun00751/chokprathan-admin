/**
 * What a package pays for each baht the member actually parts with: a discount makes the same winning
 * rate worth more. Two decimals, for comparing packages on screen.
 */
export const netPayoutPerBaht = (rate100: number, discountBp: number) => Math.round((rate100 / 100 / (1 - discountBp / 10_000)) * 100) / 100;
