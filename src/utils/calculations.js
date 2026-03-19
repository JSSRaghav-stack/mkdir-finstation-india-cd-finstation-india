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

// LBO Calculation — Industry Standard with FCF Sweep
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
    fcfSweep = true,          // FCF sweep option (default ON)
    taxRate = 25,              // Corporate tax rate %
    capexPct = 4,              // Capex as % of revenue
    wcChangePct = 2,           // Working capital change as % of revenue
    mandatoryAmortPct = 10,   // Mandatory amortization as % of initial debt
    exitType = 'Strategic',    // Exit type: Strategic, IPO, Secondary
    carryPct = 20,             // PE carry %
    hurdleRate = 8,            // Preferred return hurdle %
  } = inputs;

  const entryEbitda = entryRevenue * (entryEbitdaMargin / 100);
  const entryEV = entryEbitda * entryMultiple;
  const entryDebt = entryEbitda * debtEbitda;
  const entryEquity = entryEV - entryDebt;

  // Equity split: Senior Debt (60%), Sub/Mezz (40%)
  const seniorDebt = entryDebt * 0.7;
  const subDebt = entryDebt * 0.3;
  const equityPct = Math.round((entryEquity / entryEV) * 100);

  const mandatoryAmort = entryDebt * (mandatoryAmortPct / 100);
  const schedule = [];
  let debtBalance = entryDebt;
  let cumulativeDebtRepaid = 0;
  let cumulativeInterest = 0;
  let cumulativeFcf = 0;

  for (let yr = 1; yr <= holdingPeriod; yr++) {
    const revenue = entryRevenue * Math.pow(1 + revenueCagr / 100, yr);
    // EBITDA margin interpolates between entry and exit
    const marginProgress = yr / holdingPeriod;
    const ebitdaMargin = entryEbitdaMargin + (exitEbitdaMargin - entryEbitdaMargin) * marginProgress;
    const ebitda = revenue * (ebitdaMargin / 100);
    const mgmtFeeAmt = ebitda * (mgmtFee / 100);
    const interest = debtBalance * (interestRate / 100);
    const ebt = ebitda - mgmtFeeAmt - interest;
    const tax = Math.max(0, ebt * (taxRate / 100));
    const netIncome = ebt - tax;
    const capex = revenue * (capexPct / 100);
    const wcChange = revenue * (wcChangePct / 100);
    // FCF = EBITDA - Interest - Tax - Capex - ΔWC - Mgmt Fee
    const fcf = ebitda - interest - tax - capex - wcChange - mgmtFeeAmt;

    // Mandatory amortization first
    const mandRepaid = Math.min(mandatoryAmort, debtBalance);
    let totalRepaid = mandRepaid;

    // FCF Sweep: excess cash (after mandatory amort) pays down debt
    let fcfSweepAmt = 0;
    if (fcfSweep && fcf > mandRepaid) {
      fcfSweepAmt = Math.min(fcf - mandRepaid, debtBalance - mandRepaid);
      fcfSweepAmt = Math.max(0, fcfSweepAmt);
      totalRepaid += fcfSweepAmt;
    }

    debtBalance = Math.max(0, debtBalance - totalRepaid);
    cumulativeDebtRepaid += totalRepaid;
    cumulativeInterest += interest;
    cumulativeFcf += Math.max(0, fcf);

    // DSCR = EBITDA / (Interest + Mandatory Amort)
    const dscr = interest + mandatoryAmort > 0
      ? Math.round((ebitda / (interest + mandatoryAmort)) * 100) / 100
      : null;

    schedule.push({
      year: yr,
      revenue: Math.round(revenue),
      ebitda: Math.round(ebitda),
      mgmtFee: Math.round(mgmtFeeAmt),
      interest: Math.round(interest),
      tax: Math.round(tax),
      fcf: Math.round(Math.max(0, fcf)),
      debtRepaid: Math.round(totalRepaid),
      fcfSweep: Math.round(fcfSweepAmt),
      debtBalance: Math.round(debtBalance),
      dscr,
    });
  }

  const exitRevenue = entryRevenue * Math.pow(1 + revenueCagr / 100, holdingPeriod);
  const exitEbitda = exitRevenue * (exitEbitdaMargin / 100);

  // Exit multiple adjustment by type
  const exitMultipleAdj = exitType === 'IPO' ? exitMultiple * 1.1
    : exitType === 'Secondary' ? exitMultiple * 0.95
    : exitMultiple;

  const exitEV = exitEbitda * exitMultipleAdj;
  const exitDebt = debtBalance;
  const exitEquity = Math.max(0, exitEV - exitDebt);

  // Carried interest calculation
  const totalReturn = exitEquity - entryEquity;
  const hurdleReturn = entryEquity * Math.pow(1 + hurdleRate / 100, holdingPeriod) - entryEquity;
  const carryBase = Math.max(0, totalReturn - hurdleReturn);
  const carry = carryBase * (carryPct / 100);
  const lpProceeds = exitEquity - carry;

  // IRR calculation using Newton-Raphson
  const cashflows = [-entryEquity];
  for (let yr = 1; yr < holdingPeriod; yr++) cashflows.push(0);
  cashflows.push(exitEquity);

  const irr = calculateIRR(cashflows);
  const mom = entryEquity > 0 ? exitEquity / entryEquity : 0;

  // Exit multiple sensitivity (±2x)
  const exitSensitivity = [-2, -1, 0, 1, 2].map((delta) => {
    const adjMultiple = exitMultipleAdj + delta;
    const adjEV = exitEbitda * adjMultiple;
    const adjEquity = Math.max(0, adjEV - exitDebt);
    const adjCfs = [-entryEquity, ...Array(holdingPeriod - 1).fill(0), adjEquity];
    const adjIrr = calculateIRR(adjCfs);
    return {
      multiple: adjMultiple,
      exitEquity: Math.round(adjEquity),
      irr: Math.round(adjIrr * 10000) / 100,
      mom: entryEquity > 0 ? Math.round((adjEquity / entryEquity) * 100) / 100 : 0,
    };
  });

  return {
    entryEV: Math.round(entryEV),
    entryDebt: Math.round(entryDebt),
    entryEquity: Math.round(entryEquity),
    seniorDebt: Math.round(seniorDebt),
    subDebt: Math.round(subDebt),
    equityPct,
    exitEV: Math.round(exitEV),
    exitDebt: Math.round(exitDebt),
    exitEquity: Math.round(exitEquity),
    irr: Math.round(irr * 10000) / 100,
    mom: Math.round(mom * 100) / 100,
    carry: Math.round(carry),
    lpProceeds: Math.round(lpProceeds),
    cumulativeDebtRepaid: Math.round(cumulativeDebtRepaid),
    cumulativeInterest: Math.round(cumulativeInterest),
    cumulativeFcf: Math.round(cumulativeFcf),
    schedule,
    exitSensitivity,
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
