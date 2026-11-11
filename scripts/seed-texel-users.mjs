import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:Mohamed9094%40%23%23@db.wzqejensnajkdlprwijo.supabase.co:5432/postgres',
});

async function main() {
  await client.connect();
  const texelId = '50b0b6a0-5e7d-49c4-8f0c-697ea0e425b2';

  // 1. Fetch all employees in Texel
  const empRes = await client.query(`
    select id, national_id, full_name_ar, job_title, role, user_id
    from employees
    where company_id = $1
    order by employee_number
  `, [texelId]);

  console.log(`Total employees in Texel: ${empRes.rows.length}`);

  const targetPassword = '123456789';

  for (const emp of empRes.rows) {
    // Skip Abdulmajeed and Owner
    if (emp.national_id === '1076298874' || emp.national_id === '7036509532') {
      console.log(`Skipping special user ${emp.full_name_ar} (${emp.national_id})`);
      continue;
    }

    const email = `${emp.national_id}@users.invalid`;

    // Check if auth user already exists for this email
    const authRes = await client.query(`select id, email from auth.users where email = $1`, [email]);

    let authUserId;

    if (authRes.rows.length > 0) {
      authUserId = authRes.rows[0].id;
      // Update password
      await client.query(`
        update auth.users
        set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')),
            updated_at = now()
        where id = $2
      `, [targetPassword, authUserId]);
      console.log(`Updated password for existing auth user: ${emp.full_name_ar} (${emp.national_id}) -> ${authUserId}`);
    } else {
      // Create new auth user
      const insertAuth = await client.query(`
        insert into auth.users (
          id,
          instance_id,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          aud,
          role,
          created_at,
          updated_at
        ) values (
          gen_random_uuid(),
          '00000000-0000-0000-0000-000000000000',
          $1,
          extensions.crypt($2, extensions.gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          'authenticated',
          'authenticated',
          now(),
          now()
        )
        returning id
      `, [email, targetPassword]);

      authUserId = insertAuth.rows[0].id;
      console.log(`Created new auth user for: ${emp.full_name_ar} (${emp.national_id}) -> ${authUserId}`);
    }

    // Link user_id in employees table if not linked
    await client.query(`
      update employees
      set user_id = $1,
          role = coalesce(role, 'employee'),
          updated_at = now()
      where id = $2
    `, [authUserId, emp.id]);
  }

  // Verification
  const verifyRes = await client.query(`
    select e.national_id, e.full_name_ar, e.role, e.user_id, u.email
    from employees e
    left join auth.users u on u.id = e.user_id
    where e.company_id = $1
    order by e.employee_number
  `, [texelId]);

  console.log('\n=== VERIFICATION RESULT ===');
  console.table(verifyRes.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
