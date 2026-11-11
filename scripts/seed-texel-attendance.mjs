import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Mohamed9094%40%23%23@db.wzqejensnajkdlprwijo.supabase.co:5432/postgres',
});

async function main() {
  await client.connect();
  const texelId = '50b0b6a0-5e7d-49c4-8f0c-697ea0e425b2';
  const shiftId = '51891e65-7824-488e-b6fa-6b5c963dee98';
  const branchId = '2aea7fd6-7140-4a80-ae58-15dd0411dc38';
  const baseLat = 24.713600;
  const baseLng = 46.675300;

  // 1. Get all employees in Texel except the owner
  const empRes = await client.query(`
    select id, national_id, full_name_ar, employment_type
    from employees
    where company_id = $1 and national_id != '7036509532'
    order by employee_number
  `, [texelId]);

  console.log(`Found ${empRes.rows.length} employees to generate attendance for.`);

  // 2. Generate date list from 2026-09-01 to 2026-11-10
  const dates = [];
  const cur = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01 (Month index 8 is September)
  const end = new Date(Date.UTC(2026, 10, 10)); // 2026-11-10 (Month index 10 is November)

  while (cur <= end) {
    const dayOfWeek = cur.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday, 5 = Friday, 6 = Saturday
    // Only Sunday (0) to Thursday (4) are working days
    if (dayOfWeek >= 0 && dayOfWeek <= 4) {
      const yyyy = cur.getUTCFullYear();
      const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cur.getUTCDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  console.log(`Total working days between 2026-09-01 and 2026-11-10: ${dates.length} days`);

  // 3. Clear any existing records for this range in Texel to ensure clean data
  const delRes = await client.query(`
    delete from attendance_records
    where company_id = $1 and work_date >= '2026-09-01' and work_date <= '2026-11-10'
  `, [texelId]);
  console.log(`Cleared ${delRes.rowCount} previous attendance records in this range.`);

  // 4. Batch insert attendance records
  let insertedCount = 0;

  for (const dateStr of dates) {
    for (const emp of empRes.rows) {
      // Deterministic pseudo-random variation based on employee + date
      const hash = (emp.national_id + dateStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      
      // Check-in between 07:52 and 08:04 AST (04:52 to 05:04 UTC)
      const inMinute = 52 + (hash % 13); // 52 to 64 -> 04:52 to 05:04 UTC
      const inUtcHour = inMinute >= 60 ? 5 : 4;
      const inUtcMin = inMinute >= 60 ? inMinute - 60 : inMinute;
      const inSec = (hash * 7) % 60;
      const checkInStr = `${dateStr}T${String(inUtcHour).padStart(2, '0')}:${String(inUtcMin).padStart(2, '0')}:${String(inSec).padStart(2, '0')}Z`;

      // Check-out between 17:01 and 17:09 AST (14:01 to 14:09 UTC)
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
          id,
          company_id,
          employee_id,
          work_date,
          shift_id,
          branch_id,
          status,
          source,
          check_in_at,
          check_in_lat,
          check_in_lng,
          check_in_accuracy_m,
          check_in_distance_m,
          check_in_outside,
          check_out_at,
          check_out_lat,
          check_out_lng,
          check_out_accuracy_m,
          check_out_distance_m,
          check_out_outside,
          late_minutes,
          early_minutes,
          worked_minutes,
          created_at
        ) values (
          gen_random_uuid(),
          $1, $2, $3, $4, $5,
          'present', 'device',
          $6, $7, $8, 15.0, $9, false,
          $10, $11, $12, 18.0, $13, false,
          0, 0, 540,
          $6
        )
      `, [
        texelId,
        emp.id,
        dateStr,
        shiftId,
        branchId,
        checkInStr,
        inLat,
        inLng,
        inDistance,
        checkOutStr,
        outLat,
        outLng,
        outDistance
      ]);

      insertedCount++;
    }
  }

  console.log(`Successfully inserted ${insertedCount} attendance records!`);

  // Verify total count
  const countRes = await client.query(`
    select count(*) as total, min(work_date) as min_date, max(work_date) as max_date
    from attendance_records
    where company_id = $1
  `, [texelId]);

  console.log('Verification:', countRes.rows[0]);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
