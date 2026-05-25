export type FuelLineState = {
  // Form 01-6 fields (primary user inputs)
  openingBalanceLiters: string;
  receiptInLiters: string;
  salesInProvinceLiters: string;
  salesOutOfProvinceLiters: string;

  // Tax rate — pre-filled from province tax_rates table, read-only for station operators
  taxRatePerLiter: string;

  // Note: volumeSoldLiters is NOT an input.
  // It is derived server-side as: salesInProvinceLiters + salesOutOfProvinceLiters
};

export type ReportFormState = Record<string, FuelLineState>; // key: fuelTypeId

export type FuelTypeInfo = {
  fuelTypeId: string;
  nameTh: string;
  nameEn: string;
  taxRatePerLiter: string | null;
};

/**
 * Ad-hoc campaign context passed to ReportForm when the report was created
 * in response to a ธพ. campaign rather than a regular reporting period.
 *
 * requiredFields: null means all standard fields are required.
 *                 string[] means only those FuelLineState keys are required;
 *                 others are optional (shown with "(ไม่บังคับ)" hint).
 */
export type CampaignInfo = {
  campaignId: number;
  name: string;
  dueDate: string;
  notificationMessage: string | null;
  requiredFields: string[] | null;
};

export function emptyLine(taxRate: string | null): FuelLineState {
  return {
    openingBalanceLiters: "",
    receiptInLiters: "",
    salesInProvinceLiters: "",
    salesOutOfProvinceLiters: "",
    taxRatePerLiter: taxRate ?? "0.0000",
  };
}

export function computedFields(line: FuelLineState) {
  const opening = parseFloat(line.openingBalanceLiters) || 0;
  const receipt = parseFloat(line.receiptInLiters) || 0;
  const salesIn = parseFloat(line.salesInProvinceLiters) || 0;
  const salesOut = parseFloat(line.salesOutOfProvinceLiters) || 0;
  const rate = parseFloat(line.taxRatePerLiter) || 0;

  const volumeSold = salesIn + salesOut;       // derived for 01-4
  const taxAmount = volumeSold * rate;          // 01-4
  const totalAvailable = opening + receipt;     // 01-6
  const closingBalance = totalAvailable - salesIn - salesOut; // 01-6

  return { volumeSold, taxAmount, totalAvailable, closingBalance };
}

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
