// Indian number system formatter
export function formatIndianNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  const n = parseFloat(num);
  if (Math.abs(n) >= 10000000) { // 1 Crore = 10 Million
    return (n / 10000000).toFixed(decimals) + ' Cr';
  }
  if (Math.abs(n) >= 100000) { // 1 Lakh = 100 Thousand
    return (n / 100000).toFixed(decimals) + ' L';
  }
  return n.toFixed(decimals);
}

export function formatCr(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  const n = parseFloat(num);
  if (Math.abs(n) >= 100000) {
    return '₹' + (n / 100000).toFixed(1) + 'L Cr';
  }
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: decimals }) + ' Cr';
}

export function formatPrice(num) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return '₹' + parseFloat(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMarketCap(crores) {
  if (!crores || isNaN(crores)) return 'N/A';
  const n = parseFloat(crores);
  if (n >= 100000) {
    return '₹' + (n / 100000).toFixed(2) + 'L Cr';
  }
  return '₹' + n.toLocaleString('en-IN') + ' Cr';
}

export function formatPct(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return parseFloat(num).toFixed(decimals) + '%';
}

export function formatVolume(num) {
  if (!num || isNaN(num)) return 'N/A';
  const n = parseFloat(num);
  if (n >= 10000000) return (n / 10000000).toFixed(2) + 'Cr';
  if (n >= 100000) return (n / 100000).toFixed(2) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export function formatMultiple(num, suffix = 'x') {
  if (num === null || num === undefined || num === 'N/A') return 'N/A';
  return parseFloat(num).toFixed(1) + suffix;
}

export function formatCroreCompact(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹0';
  const n = Math.abs(parseFloat(num));
  const sign = parseFloat(num) < 0 ? '-' : '';
  if (n >= 100000) return sign + '₹' + (n / 100000).toFixed(1) + 'L Cr';
  if (n >= 1000) return sign + '₹' + (n / 1000).toFixed(1) + 'K Cr';
  return sign + '₹' + n.toFixed(0) + ' Cr';
}
