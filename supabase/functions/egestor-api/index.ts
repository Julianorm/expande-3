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

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const token = await getAccessToken()

  if (action === 'produtos') {
    const search = url.searchParams.get('search') || ''
    const { data } = await supabase
      .from('products')
      .select('*')
      .or(`descricao.ilike.%${search}%,codigo_proprio.ilike.%${search}%`)
      .or('tags.cs.{"PROPRIO"},tags.cs.{"TERCEIROS"}')
      .limit(20)
    const resultado = (data || []).map(p => ({
      codigo: p.erp_code,
      descricao: p.descricao,
      codigoProprio: p.codigo_proprio,
      precoVenda: p.preco_venda,
      unidadeTributada: p.unidade
    }))
    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'buscar_venda') {
    const codVenda = url.searchParams.get('codVenda')
    const res = await fetch(`https://api.egestor.com.br/api/v1/vendas/${codVenda}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

 if (action === 'criar_venda' && req.method === 'POST') {
    const body = await req.json()
    console.log('Body recebido:', JSON.stringify(body))
    const { codContato, nomeContato, route, produtos, codFormaPgto, situacaoOS, user_id, vencimento, dtEntrega, gpsLat, gpsLng } = body

    const { data: userConfig } = await supabase
      .from('user_config')
      .select('egestor_vendedor_code')
      .eq('user_id', user_id)
      .single()

    console.log('userConfig:', JSON.stringify(userConfig))

    const hoje = new Date().toISOString().split('T')[0]
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    const totalVenda = produtos.reduce((acc, p) => {
      const sub = p.preco * p.quant
      const desc = sub * (p.vDesc || 0) / 100
      return acc + sub - desc
    }, 0)

    console.log('Total venda:', totalVenda, 'Situacao:', situacaoOS)

    const semFinanceiro = ['Bonificação', 'Troca'].includes(situacaoOS)

   const venda: any = {
      codContato: parseInt(codContato),
      codVendedor: userConfig?.egestor_vendedor_code || 3,
      dtVenda: hoje,
      dtEntrega: dtEntrega || amanha,
      situacaoOS,
      tags: route ? [route] : [],
      produtos: produtos.map((p) => ({
        codProduto: p.codigo,
        quant: p.quant,
        preco: p.preco,
        vDesc: p.vDesc || 0
      }))
    }

    if (!semFinanceiro) {
  const codCaixa = parseInt(codFormaPgto) === 1 ? 1 : parseInt(codFormaPgto) === 16 ? 3 : undefined
venda.financeiros = [{
        codFormaPgto: parseInt(codFormaPgto),
        dtVenc: vencimento || hoje,
        valor: totalVenda,
        ...(codCaixa ? { codCaixa } : {})
      }]
    }

    const res = await fetch('https://api.egestor.com.br/api/v1/vendas', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(venda)
    })

    const result = await res.json()
    console.log('Resultado:', JSON.stringify(result))

    if (result.codigo) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('id')
        .eq('erp_code', String(codContato))
        .single()

    console.log('Salvando venda - route:', route, 'nomeContato:', nomeContato)
      const { error: saleError } = await supabase.from('sales').insert({
  user_id,
  client_id: clientData?.id || null,
  client_name: nomeContato,
  route: route || '',
  value: totalVenda,
  note: situacaoOS,
  erp_code: result.codigo,
  sale_time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  date: hoje,
  gps_lat: gpsLat || null,
  gps_lng: gpsLng || null
})
      console.log('Sale error:', saleError?.message)

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'editar_venda' && req.method === 'POST') {
    const body = await req.json()
    const { codVenda, codContato, produtos, codFormaPgto, situacaoOS, user_id } = body

    const { data: userConfig } = await supabase
      .from('user_config')
      .select('egestor_vendedor_code')
      .eq('user_id', user_id)
      .single()

    const hoje = new Date().toISOString().split('T')[0]

    const totalVenda = produtos.reduce((acc, p) => {
      const sub = p.preco * p.quant
      const desc = sub * (p.vDesc || 0) / 100
      return acc + sub - desc
    }, 0)

    const venda = {
      codContato,
      codVendedor: userConfig?.egestor_vendedor_code || 3,
      situacaoOS,
      produtos: produtos.map((p) => ({
        codProduto: p.codigo,
        quant: p.quant,
        preco: p.preco,
        vDesc: p.vDesc || 0
      })),
      financeiros: [{
        codFormaPgto: parseInt(codFormaPgto),
        dtVenc: hoje,
        valor: totalVenda
      }]
    }

    const res = await fetch(`https://api.egestor.com.br/api/v1/vendas/${codVenda}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(venda)
    })

    const result = await res.json()
    console.log('Edição resultado:', JSON.stringify(result))

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  if (action === 'vendedores') {
    const res = await fetch('https://api.egestor.com.br/api/v1/usuarios?vendedor=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

if (action === 'perfil_cliente') {
    const codContato = url.searchParams.get('codContato')
    
    // Buscar mix de produtos comprados
    const { data: items } = await supabase
      .from('sales_items')
      .select('*')
      .eq('client_erp_code', codContato)
      .order('created_at', { ascending: false })

    // Produtos únicos comprados
    const produtosMap = new Map()
    for (const item of (items || [])) {
      if (!produtosMap.has(item.erp_code)) {
        produtosMap.set(item.erp_code, {
          erp_code: item.erp_code,
          descricao: item.descricao,
          codigo_proprio: item.codigo_proprio,
          total_comprado: 0,
          quant_total: 0,
          ultima_compra: item.date
        })
      }
      const p = produtosMap.get(item.erp_code)
      p.total_comprado += item.total
      p.quant_total += item.quant
      if (item.date > p.ultima_compra) p.ultima_compra = item.date
    }

    // Total de produtos disponíveis (PROPRIO e TERCEIROS)
    const { data: allProducts } = await supabase
      .from('products')
      .select('erp_code, descricao, codigo_proprio')
      .or('tags.cs.{"PROPRIO"},tags.cs.{"TERCEIROS"}')

    const comprados = [...produtosMap.values()]
    const compradosIds = new Set(comprados.map(p => p.erp_code))
    const naoComprados = (allProducts || []).filter(p => !compradosIds.has(p.erp_code))

    // Ticket médio e total geral
    const totalGeral = (items || []).reduce((a, i) => a + i.total, 0)
    const numPedidos = new Set((items || []).map(i => i.sale_id)).size

    return new Response(JSON.stringify({
      comprados,
      naoComprados,
      totalGeral,
      numPedidos,
      mixAtual: comprados.length,
      mixTotal: (allProducts || []).length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  return new Response('Not found', { status: 404 })
})
