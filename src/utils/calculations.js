// DCF Calculation
export function calculateDCF(inputs) {
  const {
    baseRevenue,
    growthRate1to3,
    growthRate4to5,
    ebitdaMargin,
    depreciation,
    taxRate,
    capex,
    changeWC,
    wacc,
    terminalGrowthRate,
    netDebt,
    sharesOutstanding,
  } = inputs;

  const years = [1, 2, 3, 4, 5];
  const rows = [];

  let prevRevenue = baseRevenue;

  years.forEach((year) => {
    const growthRate = year <= 3 ? growthRate1to3 / 100 : growthRate4to5 / 100;
    const revenue = prevRevenue * (1 + growthRate);
    const ebitda = revenue * (ebitdaMargin / 100);
    const da = revenue * (depreciation / 100);
    const ebit = ebitda - da;
    const nopat = ebit * (1 - taxRate / 100);
    const capexAmt = revenue * (capex / 100);
    const wcChange = revenue * (changeWC / 100);
    const fcf = nopat + da - capexAmt - wcChange;
    const discountFactor = Math.pow(1 + wacc / 100, year);
    const pvFcf = fcf / discountFactor;

    rows.push({
      year,
      revenue: Math.round(revenue),
      ebitda: Math.round(ebitda),
      ebit: Math.round(ebit),
      nopat: Math.round(nopat),
      da: Math.round(da),
      capex: Math.round(capexAmt),
      changeWC: Math.round(wcChange),
      fcf: Math.round(fcf),
      pvFcf: Math.round(pvFcf),
    });

    prevRevenue = revenue;
  });

  const lastFCF = rows[4].fcf;
  const terminalValue = lastFCF * (1 + terminalGrowthRate / 100) / ((wacc / 100) - (terminalGrowthRate / 100));
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc / 100, 5);
  const sumPvFcf = rows.reduce((sum, r) => sum + r.pvFcf, 0);
  const enterpriseValue = sumPvFcf + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicValuePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;

  return {
    rows,
    sumPvFcf: Math.round(sumPvFcf),
    terminalValue: Math.round(terminalValue),
    pvTerminalValue: Math.round(pvTerminalValue),
    enterpriseValue: Math.round(enterpriseValue),
    equityValue: Math.round(equityValue),
    intrinsicValuePerShare: Math.round(intrinsicValuePerShare * 100) / 100,
  };
}

// Sensitivity analysis for DCF
export function calculateSensitivity(inputs, currentPrice) {
  const waccDeltas = [-1, 0, 1];
  const tgrDeltas = [-0.5, 0, 0.5];

  return waccDeltas.map((wDelta) =>
    tgrDeltas.map((tDelta) => {
      const result = calculateDCF({
        ...inputs,
        wacc: inputs.wacc + wDelta,
        terminalGrowthRate: inputs.terminalGrowthRate + tDelta,
      });
      return {
        wacc: inputs.wacc + wDelta,
        tgr: inputs.terminalGrowthRate + tDelta,
        value: result.intrinsicValuePerShare,
        isAbove: result.intrinsicValuePerShare > currentPrice,
      };
    })
  );
}

// LBO Calculation
export function calculateLBO(inputs) {
  const {
    entryRevenue,
    entryEbitdaMargin,
    entryMultiple,
    debtEbitda,
    interestRate,
    holdingPeriod,
    revenueCagr,
    exitEbitdaMargin,
    exitMultiple,
    mgmtFee,
  } = inputs;

  const entryEbitda = entryRevenue * (entryEbitdaMargin / 100);
  const entryEV = entryEbitda * entryMultiple;
  const entryDebt = entryEbitda * debtEbitda;
  const entryEquity = entryEV - entryDebt;

  // Debt schedule
  const mandatoryAmort = entryDebt * 0.10; // 10% per year
  const schedule = [];
  let debtBalance = entryDebt;

  for (let yr = 1; yr <= holdingPeriod; yr++) {
    const revenue = entryRevenue * Math.pow(1 + revenueCagr / 100, yr);
    const ebitda = revenue * (exitEbitdaMargin / 100);
    const mgmtFeeAmt = ebitda * (mgmtFee / 100);
    const interest = debtBalance * (interestRate / 100);
    const debtRepaid = Math.min(mandatoryAmort, debtBalance);
    debtBalance = Math.max(0, debtBalance - debtRepaid);

    schedule.push({
      year: yr,
      revenue: Math.round(revenue),
      ebitda: Math.round(ebitda),
      mgmtFee: Math.round(mgmtFeeAmt),
      interest: Math.round(interest),
      debtRepaid: Math.round(debtRepaid),
      debtBalance: Math.round(debtBalance),
    });
  }

  const exitRevenue = entryRevenue * Math.pow(1 + revenueCagr / 100, holdingPeriod);
  const exitEbitda = exitRevenue * (exitEbitdaMargin / 100);
  const exitEV = exitEbitda * exitMultiple;
  const exitDebt = debtBalance;
  const exitEquity = Math.max(0, exitEV - exitDebt);

  // IRR calculation using Newton-Raphson
  const cashflows = [-entryEquity];
  for (let yr = 1; yr < holdingPeriod; yr++) cashflows.push(0);
  cashflows.push(exitEquity);

  const irr = calculateIRR(cashflows);
  const mom = entryEquity > 0 ? exitEquity / entryEquity : 0;

  return {
    entryEV: Math.round(entryEV),
    entryDebt: Math.round(entryDebt),
    entryEquity: Math.round(entryEquity),
    exitEV: Math.round(exitEV),
    exitDebt: Math.round(exitDebt),
    exitEquity: Math.round(exitEquity),
    irr: Math.round(irr * 10000) / 100,
    mom: Math.round(mom * 100) / 100,
    schedule,
  };
}

// Newton-Raphson IRR solver
export function calculateIRR(cashflows) {
  let r = 0.15;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + r, t);
      if (t > 0) {
        dnpv -= t * cashflows[t] / Math.pow(1 + r, t + 1);
      }
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const delta = npv / dnpv;
    r = r - delta;
    if (Math.abs(delta) < 1e-10) break;
    if (r < -0.99) r = -0.99;
    if (r > 10) r = 10;
  }
  return r;
}
