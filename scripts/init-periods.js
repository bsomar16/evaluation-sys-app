const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vcotcfuodhcvmbgkivqx.supabase.co',
  '***REDACTED-SUPABASE-KEY***'
);

async function initializePeriods() {
  console.log('🔄 Initializing evaluation_periods table...\n');
  
  try {
    // Insert Q2 2026 period
    const { data: period, error: err } = await supabase
      .from('evaluation_periods')
      .insert({
        name: 'Q2 2026',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        is_active: true,
        description: 'Période juin 2026',
        created_by: 'System'
      })
      .select()
      .single();

    if (err && err.code !== '23505') {
      console.error('❌ Error inserting period:', err);
    } else if (err?.code === '23505') {
      console.log('ℹ️  Period Q2 2026 already exists in table');
    } else {
      console.log('✅ Period created:', period.name);
    }

    // Fetch all periods
    console.log('\n📋 All periods in database:');
    const { data: periods } = await supabase
      .from('evaluation_periods')
      .select('*')
      .order('start_date', { ascending: false });
    
    periods?.forEach(p => {
      const status = p.is_active ? '✅ active' : '❌ inactive';
      console.log(`   - ${p.name}: ${p.start_date} to ${p.end_date} [${status}]`);
    });

    console.log('\n✅ Periods initialized successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializePeriods();
