import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, sql } = await req.json()

    // Initialiser le client Supabase avec service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    if (action === 'apply_migrations') {
      // Exécuter chaque statement SQL
      const statements = sql.split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s && !s.startsWith('--'))

      const results: any[] = []
      
      for (const statement of statements) {
        try {
          // Exécuter via RPC si la fonction existe
          const { data, error } = await supabase
            .rpc('execute_sql', { sql: statement })

          if (error) {
            results.push({
              statement: statement.substring(0, 50),
              success: false,
              error: error.message
            })
          } else {
            results.push({
              statement: statement.substring(0, 50),
              success: true
            })
          }
        } catch (err: any) {
          results.push({
            statement: statement.substring(0, 50),
            success: false,
            error: err.message
          })
        }
      }

      return new Response(
        JSON.stringify({
          success: results.some(r => r.success),
          results,
          message: `${results.filter(r => r.success).length}/${results.length} migrations appliquées`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Unknown action')
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
