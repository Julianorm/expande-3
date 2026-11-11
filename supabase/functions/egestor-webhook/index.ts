import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function getAccessToken(personalToken: string): Promise<string> {
  const res = await fetch('https://api.egestor.com.br/api/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'personal', personal_token: personalToken })
  })
  const data = await res.json()
  return data.access_token || ''
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { action, securityToken, codigo } = body

    const { data: config } = await supabase
      .from('webhook_config')
      .select('value')
      .eq('key', 'egestor_security_token')
      .single()

    if (securityToken !== config?.value) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (action === 'deleted') {
      await supabase.from('clients').delete().eq('erp_code', String(codigo))
      return new Response('OK - deleted', { status: 200 })
    }

    const { data: tokenConfig } = await supabase
      .from('webhook_config')
      .select('value')
      .eq('key', 'egestor_token')
      .single()

    const accessToken = await getAccessToken(tokenConfig?.value || '')

    const apiUrl = `https://api.egestor.com.br/api/v1/contatos/${codigo}`
    const apiRes = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    const contato = await apiRes.json()
    console.log('Contato:', JSON.stringify(contato))

    const tags = contato.tags || []
    const inactive = tags.some((t: string) => t.trim().toUpperCase() === 'INATIVADO')
    const rotasTags = tags.filter((t: string) => t.trim().toUpperCase() !== 'INATIVADO').map((t: string) => t.trim())
    const route = rotasTags[0] || ''
    const rotas = rotasTags.length > 0 ? rotasTags : ['Sem rota']
    const name = contato.nome || contato.razaoSocial || ''

    console.log('Nome:', name, 'Rotas:', rotas, 'Inativo:', inactive)

    if (!name) {
      return new Response('Sem nome', { status: 200 })
    }

    const { error } = await supabase.from('clients').upsert({
      erp_code: String(codigo),
      empresa_id: 'mageski',
      name,
      route: route || 'Sem rota',
      rotas,
      inactive,
    }, { onConflict: 'erp_code' })

    console.log('Upsert error:', error?.message)

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('ERRO:', err.message)
    return new Response(`Erro: ${err.message}`, { status: 500 })
  }
})
