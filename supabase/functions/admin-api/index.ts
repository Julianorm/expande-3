import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ADMIN_ID = '7ad867ea-496c-412c-8acd-5cc7c21eca0e'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'criar_usuario' && req.method === 'POST') {
    const { email, password, name, egestor_code, perfil } = await req.json()

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (error) return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    await supabase.from('user_config').upsert({
      user_id: data.user.id,
      egestor_vendedor_code: egestor_code,
      name,
      perfil: perfil || 'vendedor'
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ success: true, user_id: data.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'listar_usuarios') {
    const { data: users } = await supabase.auth.admin.listUsers()
    const { data: configs } = await supabase.from('user_config').select('*')

    if (action === 'listar_usuarios') {
    const { data: users } = await supabase.auth.admin.listUsers()
    const { data: configs } = await supabase.from('user_config').select('*')
    const lista = (users?.users || []).map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      config: configs?.find(c => c.user_id === u.id) || null
    }))
    return new Response(JSON.stringify(lista), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

    return new Response(JSON.stringify(lista), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'deletar_usuario' && req.method === 'POST') {
    const { user_id } = await req.json()
    if (user_id === ADMIN_ID) return new Response(JSON.stringify({ error: 'Não pode deletar o admin' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    await supabase.auth.admin.deleteUser(user_id)
    await supabase.from('user_config').delete().eq('user_id', user_id)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'atualizar_senha' && req.method === 'POST') {
    const { user_id, password } = await req.json()
    const { error } = await supabase.auth.admin.updateUserById(user_id, { password })
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response('Not found', { status: 404 })
})
