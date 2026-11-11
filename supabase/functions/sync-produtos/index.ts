import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function getAccessToken() {
  const { data } = await supabase.from('webhook_config').select('value').eq('key', 'egestor_token').single()
  const res = await fetch('https://api.egestor.com.br/api/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'personal', personal_token: data?.value })
  })
  const json = await res.json()
  return json.access_token || ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const token = await getAccessToken()
  let todos = []
  let page = 1
  let lastPage = 1

  do {
    const res = await fetch(`https://api.egestor.com.br/api/v1/produtos?per_page=50&page=${page}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const json = await res.json()
    todos = todos.concat(json.data || [])
    lastPage = json.last_page || 1
    page++
  } while (page <= lastPage)

 const toUpsert = todos.map(p => ({
    erp_code: p.codigo,
    descricao: p.descricao,
    codigo_proprio: p.codigoProprio || '',
    preco_venda: p.precoVenda,
    unidade: p.unidadeTributada || 'UN',
    tags: p.tags || [],
    updated_at: new Date().toISOString()
  }))

  const { error } = await supabase.from('products').upsert(toUpsert, { onConflict: 'erp_code' })
  
  console.log('Sincronizados:', toUpsert.length, 'Erro:', error?.message)

return new Response(JSON.stringify({ total: toUpsert.length, error: error?.message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
