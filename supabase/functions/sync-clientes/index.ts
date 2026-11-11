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
    const { data: tokenConfig } = await supabase
      .from('webhook_config')
      .select('value')
      .eq('key', 'egestor_token')
      .single()

    const accessToken = await getAccessToken(tokenConfig?.value || '')

    let page = 1
    let totalSincronizados = 0
    let totalPaginas = 1

    do {
      const res = await fetch(`https://api.egestor.com.br/api/v1/contatos?page=${page}&per_page=50`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const data = await res.json()
      totalPaginas = data.last_page || 1

    for (const contato of (data.data || [])) {
        const tags = contato.tags || []
        const inactive = tags.some((t: string) => t.trim().toUpperCase() === 'INATIVADO')
        const rotasTags = tags.filter((t: string) => t.trim().toUpperCase() !== 'INATIVADO').map((t: string) => t.trim())
        const route = rotasTags[0] || ''
        const rotas = rotasTags.length > 0 ? rotasTags : ['Sem rota']
        const name = contato.nome || contato.razaoSocial || ''

        if (!name) continue

        await supabase.from('clients').upsert({
          erp_code: String(contato.codigo),
          empresa_id: 'mageski',
          name,
          route: route || 'Sem rota',
          rotas,
          inactive,
        }, { onConflict: 'erp_code' })

        totalSincronizados++
      }

      page++
    } while (page <= totalPaginas)

    return new Response(JSON.stringify({ success: true, total: totalSincronizados }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
