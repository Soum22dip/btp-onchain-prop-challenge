// =============================================================================
// Telegram — Message Formatters (MarkdownV2)
// =============================================================================

const MD_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MD_SPECIAL, '\\$&');
}

export function formatUsd(amount: number, decimals = 2): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return escapeMarkdown(`$${amount < 0 ? '-' : ''}${formatted}`);
}

export function formatPnl(amount: number): string {
  const emoji = amount >= 0 ? '\u{1F7E2}' : '\u{1F534}'; // green/red circle
  const sign = amount >= 0 ? '+' : '';
  return `${emoji} ${formatUsd(amount)}`.replace(
    formatUsd(amount),
    escapeMarkdown(`${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`),
  );
}

export function formatPercent(value: number, decimals = 2): string {
  return escapeMarkdown(`${value.toFixed(decimals)}%`);
}

export function formatMarket(market: string): string {
  // Forex pairs use underscore: EUR_USD → EUR/USD
  if (market.includes('_')) return escapeMarkdown(market.replace('_', '/'));
  // Index ETFs: SPY, QQQ, DIA, IWM — no /USD
  if (['SPY', 'QQQ', 'DIA', 'IWM'].includes(market)) return escapeMarkdown(market);
  // Everything else: BTC → BTC/USD
  return escapeMarkdown(`${market}/USD`);
}

export function formatPrice(price: number, market?: string): string {
  let decimals = 2;
  if (market && (market.includes('JPY') || market === 'USD_MXN' || market === 'USD_SGD')) {
    decimals = 3;
  } else if (market && market.includes('_')) {
    decimals = 5;
  } else if (price < 0.001) {
    decimals = 8;
  } else if (price < 0.1) {
    decimals = 6;
  } else if (price < 1) {
    decimals = 6;
  } else if (price < 100) {
    decimals = 4;
  }
  return escapeMarkdown(`$${price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`);
}
