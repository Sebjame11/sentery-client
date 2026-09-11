export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 },
  { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.92 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rate: 0.79 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 149 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', rate: 7.24 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rate: 1.52 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 1.36 },
  { code: 'CHF', symbol: 'Fr ', name: 'Swiss Franc', rate: 0.88 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rate: 1.34 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', rate: 7.8 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', rate: 1.64 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 83 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', rate: 1330 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', rate: 35.5 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', rate: 25000 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', rate: 15800 },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', rate: 4.7 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', rate: 56 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', rate: 3.67 },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', rate: 3.75 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', rate: 5.4 },
  { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso', rate: 18.3 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', rate: 18.5 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', rate: 10.5 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', rate: 10.8 },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', rate: 6.9 },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', rate: 3.9 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', rate: 33 },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', rate: 88 },
];

let currentCode = 'USD';

export function setCurrencyCode(code) {
  currentCode = (CURRENCIES.some(c => c.code === code) ? code : 'USD');
}

export function getCurrencyCode() {
  return currentCode;
}

export function getCurrency(code) {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

export function currencySymbol(code) {
  return getCurrency(code || currentCode).symbol;
}

export function convertAmount(value, fromCode, toCode) {
  const from = getCurrency(fromCode).rate;
  const to = getCurrency(toCode).rate;
  return (Number(value) || 0) * (to / from);
}
