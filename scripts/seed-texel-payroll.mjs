import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Mohamed9094%40%23%23@db.wzqejensnajkdlprwijo.supabase.co:5432/postgres',
});

async function main() {
  await client.connect();
  const texelId = '50b0b6a0-5e7d-49c4-8f0c-697ea0e425b2';
  const abdulmajeedUserId = '4f8c3fd5-70d8-41c0-b5b6-dd9e1632ba14';

  // Fetch employees and their compensation
  const empCompRes = await client.query(`
    select
      e.id as employee_id,
      e.national_id,
      e.full_name_ar,
      ec.bank_name,
      ec.iban,
      coalesce(ec.basic_salary, 3000) as basic_salary,
      coalesce(ec.housing_allowance, 1000) as housing_allowance,
      coalesce(ec.transport_allowance, 0) as transport_allowance
    from employees e
    left join employee_compensation ec on ec.employee_id = e.id
    where e.company_id = $1 and e.national_id != '7036509532'
    order by e.employee_number
  `, [texelId]);

  console.log(`Generating payroll for ${empCompRes.rows.length} employees.`);

  // Clean existing payroll runs for month 9 and 10 of 2026
  const existingRuns = await client.query(`
    select id from payroll_runs
    where company_id = $1 and year = 2026 and month in (9, 10)
  `, [texelId]);

  for (const r of existingRuns.rows) {
    await client.query(`delete from payroll_slips where payroll_run_id = $1`, [r.id]);
    await client.query(`delete from payroll_runs where id = $1`, [r.id]);
  }

  const monthsToSeed = [
    { month: 9, approvedAt: '2026-09-30T10:00:00Z', notes: 'مسير رواتب شهر سبتمبر 2026 - معتمد' },
    { month: 10, approvedAt: '2026-10-31T10:00:00Z', notes: 'مسير رواتب شهر أكتوبر 2026 - معتمد' },
  ];

  for (const m of monthsToSeed) {
    let sumBasic = 0;
    let sumHousing = 0;
    let sumOtherAllowances = 0;
    let sumGross = 0;
    let sumGosiEmployee = 0;
    let sumGosiEmployer = 0;
    let sumDeductions = 0;
    let sumNet = 0;

    const slipsData = [];

    for (const emp of empCompRes.rows) {
      const basic = parseFloat(emp.basic_salary);
      const housing = parseFloat(emp.housing_allowance);
      const transport = parseFloat(emp.transport_allowance);
      const gross = basic + housing + transport;
      
      // GOSI: 9.75% employee contribution on basic + housing
      const gosiBase = basic + housing;
      const gosiEmp = Math.round(gosiBase * 0.0975 * 100) / 100;
      const gosiEmployer = Math.round(gosiBase * 0.1175 * 100) / 100;
      const totalDeductions = gosiEmp;
      const net = Math.round((gross - totalDeductions) * 100) / 100;

      sumBasic += basic;
      sumHousing += housing;
      sumOtherAllowances += transport;
      sumGross += gross;
      sumGosiEmployee += gosiEmp;
      sumGosiEmployer += gosiEmployer;
      sumDeductions += totalDeductions;
      sumNet += net;

      slipsData.push({
        employee_id: emp.employee_id,
        basic_salary: basic,
        housing_allowance: housing,
        transport_allowance: transport,
        gross_salary: gross,
        gosi_employee: gosiEmp,
        gosi_employer: gosiEmployer,
        total_deductions: totalDeductions,
        net_salary: net,
        bank_name: emp.bank_name || 'مصرف الراجحي',
        iban: emp.iban || 'SA0000000000000000000000'
      });
    }

    // Insert payroll run
    const runRes = await client.query(`
      insert into payroll_runs (
        id,
        company_id,
        year,
        month,
        status,
        total_basic,
        total_housing,
        total_other_allowances,
        total_gross,
        total_gosi_employee,
        total_gosi_employer,
        total_attendance_deductions,
        total_leave_deductions,
        total_advance_deductions,
        total_other_deductions,
        total_deductions,
        total_net,
        employee_count,
        notes,
        created_by,
        approved_by,
        approved_at,
        created_at
      ) values (
        gen_random_uuid(),
        $1, 2026, $2, 'approved',
        $3, $4, $5, $6,
        $7, $8, 0, 0, 0, 0,
        $9, $10, $11, $12,
        $13, $13, $14, $14
      )
      returning id
    `, [
      texelId,
      m.month,
      sumBasic.toFixed(2),
      sumHousing.toFixed(2),
      sumOtherAllowances.toFixed(2),
      sumGross.toFixed(2),
      sumGosiEmployee.toFixed(2),
      sumGosiEmployer.toFixed(2),
      sumDeductions.toFixed(2),
      sumNet.toFixed(2),
      slipsData.length,
      m.notes,
      abdulmajeedUserId,
      m.approvedAt
    ]);

    const runId = runRes.rows[0].id;

    // Insert slips
    for (const s of slipsData) {
      await client.query(`
        insert into payroll_slips (
          id,
          company_id,
          payroll_run_id,
          employee_id,
          basic_salary,
          housing_allowance,
          transport_allowance,
          communication_allowance,
          other_allowances,
          gross_salary,
          gosi_employee,
          gosi_employer,
          attendance_deduction,
          leave_deduction,
          advance_deduction,
          other_deductions,
          total_deductions,
          net_salary,
          bank_name,
          iban,
          notes,
          created_at
        ) values (
          gen_random_uuid(),
          $1, $2, $3,
          $4, $5, $6, 0, 0,
          $7, $8, $9, 0, 0, 0, 0,
          $10, $11, $12, $13, 'معتمد ومسدد', $14
        )
      `, [
        texelId,
        runId,
        s.employee_id,
        s.basic_salary,
        s.housing_allowance,
        s.transport_allowance,
        s.gross_salary,
        s.gosi_employee,
        s.gosi_employer,
        s.total_deductions,
        s.net_salary,
        s.bank_name,
        s.iban,
        m.approvedAt
      ]);
    }

    console.log(`Month ${m.month}/2026: Created run ${runId} with ${slipsData.length} slips. Gross: ${sumGross}, Net: ${sumNet}`);
  }

  // Verify
  const checkRes = await client.query(`
    select year, month, status, employee_count, total_gross, total_net
    from payroll_runs
    where company_id = $1
    order by year, month
  `, [texelId]);

  console.table(checkRes.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
