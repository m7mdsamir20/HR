// GOSI (General Organization for Social Insurance) rules and calculation for Saudi Arabia.
// References: Saudi Social Insurance Law, Unemployment Insurance (Saned).

export const GOSI_RATES = {
  MAX_CONTRIBUTORY_WAGE: 45000,
  // Saudi Citizen rates
  SAUDI_EMPLOYEE_ANNUITIES: 0.09,
  SAUDI_EMPLOYER_ANNUITIES: 0.09,
  SAUDI_EMPLOYEE_SANED: 0.0075,
  SAUDI_EMPLOYER_SANED: 0.0075,
  SAUDI_EMPLOYEE_TOTAL: 0.0975,
  SAUDI_EMPLOYER_TOTAL: 0.1175,
  // Non-Saudi (Resident) rates
  RESIDENT_EMPLOYEE_TOTAL: 0.0,
  RESIDENT_EMPLOYER_HAZARDS: 0.02,
  // Occupational hazards (all employees, paid 100% by employer)
  OCCUPATIONAL_HAZARDS: 0.02,
} as const;

export interface GosiCalculationResult {
  contributoryWage: number;
  employeeShare: number;
  employerShare: number;
  annuitiesEmployee: number;
  annuitiesEmployer: number;
  sanedEmployee: number;
  sanedEmployer: number;
  hazardsEmployer: number;
}

/**
 * Calculates GOSI contributions for an employee based on their nationality and salary structure.
 * Contributory wage = min(basic_salary + housing_allowance, 45000).
 */
export function calculateGosi(
  idType: "citizen" | "resident",
  basicSalary: number,
  housingAllowance: number = 0
): GosiCalculationResult {
  const wage = Math.max(0, basicSalary + housingAllowance);
  const contributoryWage = Math.min(wage, GOSI_RATES.MAX_CONTRIBUTORY_WAGE);

  if (idType === "citizen") {
    const annuitiesEmployee = Number((contributoryWage * GOSI_RATES.SAUDI_EMPLOYEE_ANNUITIES).toFixed(2));
    const annuitiesEmployer = Number((contributoryWage * GOSI_RATES.SAUDI_EMPLOYER_ANNUITIES).toFixed(2));
    const sanedEmployee = Number((contributoryWage * GOSI_RATES.SAUDI_EMPLOYEE_SANED).toFixed(2));
    const sanedEmployer = Number((contributoryWage * GOSI_RATES.SAUDI_EMPLOYER_SANED).toFixed(2));
    const hazardsEmployer = Number((contributoryWage * GOSI_RATES.OCCUPATIONAL_HAZARDS).toFixed(2));

    const employeeShare = Number((annuitiesEmployee + sanedEmployee).toFixed(2));
    const employerShare = Number((annuitiesEmployer + sanedEmployer + hazardsEmployer).toFixed(2));

    return {
      contributoryWage,
      employeeShare,
      employerShare,
      annuitiesEmployee,
      annuitiesEmployer,
      sanedEmployee,
      sanedEmployer,
      hazardsEmployer,
    };
  }

  // Non-Saudi resident
  const hazardsEmployer = Number((contributoryWage * GOSI_RATES.RESIDENT_EMPLOYER_HAZARDS).toFixed(2));
  return {
    contributoryWage,
    employeeShare: 0,
    employerShare: hazardsEmployer,
    annuitiesEmployee: 0,
    annuitiesEmployer: 0,
    sanedEmployee: 0,
    sanedEmployer: 0,
    hazardsEmployer,
  };
}
