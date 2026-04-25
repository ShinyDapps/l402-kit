export class BudgetExceededError extends Error {
  constructor(
    public readonly url: string,
    public readonly required: number,
    public readonly remaining: number,
  ) {
    super(`Budget exceeded: need ${required} sats but only ${remaining} remaining (${url})`);
    this.name = "BudgetExceededError";
  }
}

export interface SpendingReport {
  total: number;
  remaining: number;
  byDomain: Record<string, number>;
  transactions: Array<{ url: string; sats: number; ts: number }>;
}

export class BudgetTracker {
  private spent = 0;
  private byDomain: Record<string, number> = {};
  private transactions: Array<{ url: string; sats: number; ts: number }> = [];

  constructor(
    private readonly limitSats: number,
    private readonly perDomain?: Record<string, number>,
    private readonly onSpend?: (sats: number, url: string) => void,
    private readonly onBudgetExceeded?: (url: string, sats: number) => void,
  ) {}

  check(url: string, sats: number): void {
    const remaining = this.limitSats - this.spent;
    if (sats > remaining) {
      this.onBudgetExceeded?.(url, sats);
      throw new BudgetExceededError(url, sats, remaining);
    }

    if (this.perDomain) {
      const domain = this._domain(url);
      const domainLimit = this.perDomain[domain];
      if (domainLimit !== undefined) {
        const domainSpent = this.byDomain[domain] ?? 0;
        const domainRemaining = domainLimit - domainSpent;
        if (sats > domainRemaining) {
          this.onBudgetExceeded?.(url, sats);
          throw new BudgetExceededError(url, sats, domainRemaining);
        }
      }
    }
  }

  record(url: string, sats: number): void {
    this.spent += sats;
    const domain = this._domain(url);
    this.byDomain[domain] = (this.byDomain[domain] ?? 0) + sats;
    this.transactions.push({ url, sats, ts: Date.now() });
    this.onSpend?.(sats, url);
  }

  report(): SpendingReport {
    return {
      total: this.spent,
      remaining: Math.max(0, this.limitSats - this.spent),
      byDomain: { ...this.byDomain },
      transactions: [...this.transactions],
    };
  }

  private _domain(url: string): string {
    try { return new URL(url).hostname; }
    catch { return url; }
  }
}
