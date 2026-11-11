import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Mohamed9094%40%23%23@db.wzqejensnajkdlprwijo.supabase.co:5432/postgres',
});

async function main() {
  await client.connect();
  const texelId = '50b0b6a0-5e7d-49c4-8f0c-697ea0e425b2';

  const recordsRes = await client.query(`
    select a.id, a.work_date, a.employee_id, e.national_id, a.check_in_at, a.check_out_at
    from attendance_records a
    join employees e on e.id = a.employee_id
    where a.company_id = $1
    order by a.work_date, a.employee_id
  `, [texelId]);

  console.log(`Found ${recordsRes.rows.length} records to add rich natural variation.`);

  let updatedCount = 0;
  for (const rec of recordsRes.rows) {
    const dateStr = typeof rec.work_date === 'string' ? rec.work_date.slice(0, 10) : rec.work_date.toISOString().slice(0, 10);
    // Hash based on employee and date to keep it consistent
    const seed = (rec.national_id + dateStr).split('').reduce((acc, c, idx) => acc + c.charCodeAt(0) * (idx + 1), 0);
    
    // Spread arrival time between 07:42 and 08:15 (AST)
    // 07:42 is 04:42 UTC
    // range: 04:42 to 05:15 UTC (33 minutes span)
    const inOffset = (seed % 34); // 0 to 33
    const inTotalMin = 42 + inOffset; // 42 to 75 -> 04:42 to 05:15 UTC (07:42 to 08:15 AST)
    const inUtcHour = inTotalMin >= 60 ? 5 : 4;
    const inUtcMin = inTotalMin >= 60 ? inTotalMin - 60 : inTotalMin;
    const inSec = (seed * 13) % 60;
    const newCheckIn = `${dateStr}T${String(inUtcHour).padStart(2, '0')}:${String(inUtcMin).padStart(2, '0')}:${String(inSec).padStart(2, '0')}Z`;

    // Shift start is 08:00 AST (05:00 UTC)
    // If inUtcHour === 5 and inUtcMin > 0, late_minutes = inUtcMin
    let lateMins = 0;
    if (inUtcHour === 5 && inUtcMin > 0) {
      // Keep late occurrences reasonable (e.g. only about 15% of records have late minutes, unless Atheer which had explicit rules)
      if (seed % 7 === 0) {
        lateMins = inUtcMin;
      }
    }

    // Spread departure time between 16:57 and 17:28 (AST)
    // 16:57 is 13:57 UTC
    // 17:28 is 14:28 UTC (31 minutes span)
    const outOffset = (seed * 3) % 32; // 0 to 31
    const outTotalMin = 57 + outOffset; // 57 to 88 -> 13:57 to 14:28 UTC (16:57 to 17:28 AST)
    const outUtcHour = outTotalMin >= 60 ? 14 : 13;
    const outUtcMin = outTotalMin >= 60 ? outTotalMin - 60 : outTotalMin;
    const outSec = (seed * 17) % 60;
    const newCheckOut = `${dateStr}T${String(outUtcHour).padStart(2, '0')}:${String(outUtcMin).padStart(2, '0')}:${String(outSec).padStart(2, '0')}Z`;

    // Worked minutes
    const inMs = new Date(newCheckIn).getTime();
    const outMs = new Date(newCheckOut).getTime();
    const workedMins = Math.max(0, Math.floor((outMs - inMs) / 60000));

    await client.query(`
      update attendance_records
      set check_in_at = $1,
          check_out_at = $2,
          worked_minutes = $3,
          late_minutes = $4
      where id = $5
    `, [newCheckIn, newCheckOut, workedMins, lateMins, rec.id]);

    updatedCount++;
  }

  console.log(`Successfully updated ${updatedCount} records with natural varied check-in/out times.`);
  await client.end();
}

main().catch(console.error);
