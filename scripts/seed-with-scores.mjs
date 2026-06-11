#!/usr/bin/env node

/**
 * Direct seed script for evaluation scores
 * Run: node scripts/seed-with-scores.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim().replace(/['"]/g, '');
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedWithScores() {
  try {
    console.log('🌱 Seeding evaluations with scores...\n');

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .is('archived_at', null);

    if (usersError || !users) {
      console.error('❌ Error fetching users:', usersError);
      process.exit(1);
    }

    console.log(`📝 Found ${users.length} users\n`);

    // Get evaluations count
    const { data: evals, error: evalsError } = await supabase
      .from('evaluations')
      .select('id, score, period');

    if (!evalsError && evals) {
      const withScores = evals.filter(e => e.score !== null);
      console.log(`📊 Current evaluations: ${evals.length}`);
      console.log(`   With scores: ${withScores.length}`);
      console.log(`   Without scores: ${evals.length - withScores.length}\n`);

      // Show periods in database
      const periods = [...new Set(evals.map(e => e.period))];
      console.log(`📋 Periods found: ${periods.join(', ')}\n`);

      if (withScores.length > 0) {
        console.log('✅ Evaluations already have scores, skipping new seeding\n');
        
        // Still show summary
        const byPeriod = {};
        evals.forEach(e => {
          if (!byPeriod[e.period]) byPeriod[e.period] = [];
          if (e.score) byPeriod[e.period].push(e.score);
        });

        console.log('📈 Current Summary:');
        Object.entries(byPeriod).forEach(([period, scores]) => {
          const avg = (scores.reduce((a, b) => a + b) / scores.length).toFixed(2);
          console.log(`  ${period}: ${scores.length} evaluations, avg score: ${avg}`);
        });
        
        process.exit(0);
      }
    }

    // Create new evaluations
    const evaluations = [];
    const managerId = users[0]?.id;

    users.forEach((user, idx) => {
      // Q2 2026 evaluation
      evaluations.push({
        employee_id: user.id,
        employee_email: user.email,
        employee_name: user.name,
        manager_id: managerId,
        period: 'Q2 2026',
        score: Math.round((Math.random() * 15 + 5) * 100) / 100,
        feedback: 'Évaluation Q2 2026',
        status: 'completed',
      });

      // Q3 2026 evaluation
      evaluations.push({
        employee_id: user.id,
        employee_email: user.email,
        employee_name: user.name,
        manager_id: managerId,
        period: 'Q3 2026',
        score: Math.round((Math.random() * 15 + 5) * 100) / 100,
        feedback: 'Évaluation Q3 2026',
        status: 'completed',
      });
    });

    console.log(`📊 Inserting ${evaluations.length} evaluations with scores...\n`);

    const { data: inserted, error: insertError } = await supabase
      .from('evaluations')
      .insert(evaluations);

    if (insertError) {
      console.warn('⚠️ Insert error (might be duplicates):', insertError.message);
    } else {
      console.log(`✅ Successfully inserted evaluations\n`);
    }

    // Verify
    const { data: allEvals } = await supabase
      .from('evaluations')
      .select('period, score');

    if (allEvals) {
      const byPeriod = {};
      allEvals.forEach(e => {
        if (!byPeriod[e.period]) byPeriod[e.period] = [];
        if (e.score) byPeriod[e.period].push(e.score);
      });

      console.log('📈 Summary:');
      console.log('Periods in database:', Object.keys(byPeriod).join(', '));
      Object.entries(byPeriod).forEach(([period, scores]) => {
        const avg = (scores.reduce((a, b) => a + b) / scores.length).toFixed(2);
        console.log(`  ${period}: ${scores.length} evaluations with scores, avg: ${avg}`);
      });
    }

    console.log('\n✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedWithScores();
