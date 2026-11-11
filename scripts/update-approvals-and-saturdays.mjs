import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Mohamed9094%40%23%23@db.wzqejensnajkdlprwijo.supabase.co:5432/postgres',
});

async function main() {
  await client.connect();
  const texelId = '50b0b6a0-5e7d-49c4-8f0c-697ea0e425b2';
  const ownerUserId = '1b96da6d-4525-422b-af6b-312d8ce774ec';
  const ownerEmployeeId = '816f5fd9-d125-4c0b-bb1d-dc242642b080';
  const shiftId = '51891e65-7824-488e-b6fa-6b5c963dee98';
  const branchId = '2aea7fd6-7140-4a80-ae58-15dd0411dc38';
  const baseLat = 24.713600;
  const baseLng = 46.675300;

  console.log('--- 1. Updating Approvals to Owner ---');
  // Update payroll_runs approved_by and created_by to Owner
  const prRes = await client.query(`
    update payroll_runs
    set approved_by = $1, created_by = $1
    where company_id = $2
  `, [ownerUserId, texelId]);
  console.log(`Updated ${prRes.rowCount} payroll runs to Owner approval.`);

  // Update task_reports reviewed_by to Owner employee ID
  const trRes = await client.query(`
    update task_reports
    set reviewed_by = $1
    where company_id = $2
  `, [ownerEmployeeId, texelId]);
  console.log(`Updated ${trRes.rowCount} task reports to Owner approval.`);

  console.log('\n--- 2. Adding Saturday Attendance Records ---');
  // 10 Saturdays between 2026-09-01 and 2026-11-10:
  // 2026-09-05, 2026-09-12, 2026-09-19, 2026-09-26
  // 2026-10-03, 2026-10-10, 2026-10-17, 2026-10-24, 2026-10-31
  // 2026-11-07
  const saturdays = [
    '2026-09-05',
    '2026-09-12',
    '2026-09-19',
    '2026-09-26',
    '2026-10-03',
    '2026-10-10',
    '2026-10-17',
    '2026-10-24',
    '2026-10-31',
    '2026-11-07'
  ];

  const empRes = await client.query(`
    select id, national_id, full_name_ar
    from employees
    where company_id = $1 and national_id != '7036509532'
    order by employee_number
  `, [texelId]);

  console.log(`Generating Saturday attendance for ${empRes.rows.length} employees across ${saturdays.length} Saturdays.`);

  let insertedCount = 0;
  for (const dateStr of saturdays) {
    for (const emp of empRes.rows) {
      // Check if record already exists
      const existing = await client.query(`
        select id from attendance_records
        where company_id = $1 and employee_id = $2 and work_date = $3
      `, [texelId, emp.id, dateStr]);

      if (existing.rows.length > 0) continue;

      const hash = (emp.national_id + dateStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const inMinute = 52 + (hash % 13);
      const inUtcHour = inMinute >= 60 ? 5 : 4;
      const inUtcMin = inMinute >= 60 ? inMinute - 60 : inMinute;
      const inSec = (hash * 7) % 60;
      const checkInStr = `${dateStr}T${String(inUtcHour).padStart(2, '0')}:${String(inUtcMin).padStart(2, '0')}:${String(inSec).padStart(2, '0')}Z`;

      const outUtcMin = 1 + (hash % 9);
      const outSec = (hash * 11) % 60;
      const checkOutStr = `${dateStr}T14:${String(outUtcMin).padStart(2, '0')}:${String(outSec).padStart(2, '0')}Z`;

      const latJitter = ((hash % 100) - 50) * 0.00002;
      const lngJitter = (((hash * 3) % 100) - 50) * 0.00002;
      const inLat = baseLat + latJitter;
      const inLng = baseLng + lngJitter;
      const outLat = baseLat + (latJitter * 0.9);
      const outLng = baseLng + (lngJitter * 0.9);
      const inDistance = 15 + (hash % 35);
      const outDistance = 18 + ((hash * 2) % 35);

      await client.query(`
        insert into attendance_records (
          id, company_id, employee_id, work_date, shift_id, branch_id,
          status, source, check_in_at, check_in_lat, check_in_lng,
          check_in_accuracy_m, check_in_distance_m, check_in_outside,
          check_out_at, check_out_lat, check_out_lng, check_out_accuracy_m,
          check_out_distance_m, check_out_outside, late_minutes, early_minutes,
          worked_minutes, created_at
        ) values (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          'present', 'device', $6, $7, $8, 15.0, $9, false,
          $10, $11, $12, 18.0, $13, false, 0, 0, 540, $6
        )
      `, [
        texelId, emp.id, dateStr, shiftId, branchId,
        checkInStr, inLat, inLng, inDistance,
        checkOutStr, outLat, outLng, outDistance
      ]);
      insertedCount++;
    }
  }

  console.log(`Inserted ${insertedCount} Saturday attendance records!`);

  const totalAtt = await client.query(`
    select count(*) as total, count(distinct work_date) as total_days
    from attendance_records
    where company_id = $1
  `, [texelId]);
  console.log('Total attendance records now:', totalAtt.rows[0]);

  await client.end();
}

main().catch(console.error);
