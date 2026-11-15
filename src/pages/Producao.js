// eXpande 3.0 — Produção (1ª etapa): plano do dia, aprovação e registro do produzido.
// Cálculo: pedidos/vendas firmes para as datas de entrega + média das rotas que ainda não venderam
// (vendas registradas no próprio eXpande, mesmo dia da semana, últimas 8 semanas) + margem da rota.
import { useEffect, useMemo, useState } from 'react'

const ACCENT = '#2563EB', SUCCESS = '#16A34A', WARNING = '#D97706', DANGER = '#DC2626'
const SURFACE = '#F8FAFC', CARD = '#FFFFFF', BORDER = '#E2E8F0', MUTED = '#64748B', TEXT = '#0F172A'
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEMANAS_HISTORICO = 8

const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }
const input = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, background: CARD, boxSizing: 'border-box' }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' })
const label = { fontSize: 11, fontWeight: 600, color: MUTED, display: 'block', marginBottom: 4 }

// Datas sempre como 'AAAA-MM-DD' no horário local.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dt = s => new Date(s + 'T12:00:00')
const somaDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d) }
const hojeLocal = () => iso(new Date())
const br = s => dt(s).toLocaleDateString('pt-BR')
const curto = s => `${DIAS_CURTO[dt(s).getDay()]} ${br(s).slice(0, 5)}`
const num = (v, casas = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const meiaReceita = v => Math.ceil(v * 2 - 1e-9) / 2

// Produz no dia D, entrega em D+2; quinta produz para segunda + terça; sexta não produz pão.
export function entregasDaProducao(dataProducao) {
  const dow = dt(dataProducao).getDay()
  if (dow >= 1 && dow <= 3) return [somaDias(dataProducao, 2)]
  if (dow === 4) return [somaDias(dataProducao, 4), somaDias(dataProducao, 5)]
  return []
}

// Busca todas as linhas (o Supabase devolve no máximo 1000 por vez).
async function buscarTudo(montar) {
  const tudo = []
  for (let pag = 0; pag < 50; pag++) {
    const { data, error } = await montar().range(pag * 1000, pag * 1000 + 999)
    if (error) throw error
    tudo.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return tudo
}
async function itensDasVendas(supabase, ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    out.push(...await buscarTudo(() => supabase.from('sales_items').select('sale_id,erp_code,quant').in('sale_id', lote)))
  }
  return out
}

// ---------------------------------------------------------------------------
// Cálculo da sugestão
export async function calcularSugestao(supabase, dataProducao, { linhas, produtos, calendario }) {
  const entregas = entregasDaProducao(dataProducao)
  const prodMap = new Map(produtos.filter(p => p.ativo).map(p => [Number(p.erp_code), p]))
  const linhaMap = new Map(linhas.filter(l => l.ativo).map(l => [l.nome, l]))
  const cal = calendario.filter(c => c.ativo)

  // Período necessário: histórico de 8 semanas antes da produção até a maior data de entrega.
  const inicio = somaDias(dataProducao, -7 * SEMANAS_HISTORICO - 7)
  const fim = entregas.length ? entregas[entregas.length - 1] : dataProducao
  const [vendas, pedidos] = await Promise.all([
    buscarTudo(() => supabase.from('sales').select('id,route,date,dt_entrega').gte('date', inicio).lte('date', fim)),
    buscarTudo(() => supabase.from('orders').select('id,route,date,dt_entrega,produtos,status').eq('status', 'pendente'))
  ])
  const itens = await itensDasVendas(supabase, vendas.map(v => v.id))
  const itensPorVenda = new Map()
  for (const it of itens) { if (!itensPorVenda.has(it.sale_id)) itensPorVenda.set(it.sale_id, []); itensPorVenda.get(it.sale_id).push(it) }

  const soma = (m, k, q) => m.set(k, (m.get(k) || 0) + q)
  const diasComEntrega = new Set(cal.map(c => c.dia_entrega))

  // Demanda de uma data de entrega: firmes (vendas/pedidos) + média das rotas que ainda não venderam.
  const demanda = (E, info) => {
    const firme = new Map(), estimado = new Map()
    const e = dt(E).getDay()
    const rotasDoDia = cal.filter(c => c.dia_entrega === e)
    // Data de venda que corresponde a esta entrega, por rota.
    const dataVendaDe = c => somaDias(E, -((e - c.dia_venda + 7) % 7))
    const rotaDaEntrega = new Map(rotasDoDia.map(c => [c.rota, c]))
    const vendeu = new Set()
    // Firmes: vendas exportadas com dt_entrega = E; ou (sem dt_entrega) vendidas no dia de venda da rota.
    for (const v of vendas) {
      const c = rotaDaEntrega.get(v.route)
      const ehDaEntrega = v.dt_entrega ? v.dt_entrega === E : (c && v.date === dataVendaDe(c))
      if (!ehDaEntrega) continue
      vendeu.add(v.route)
      for (const it of itensPorVenda.get(v.id) || []) if (prodMap.has(Number(it.erp_code))) soma(firme, Number(it.erp_code), Number(it.quant) || 0)
    }
    // Firmes: pedidos ainda não exportados.
    for (const o of pedidos) {
      const c = rotaDaEntrega.get(o.route)
      const ehDaEntrega = o.dt_entrega ? o.dt_entrega === E : (c && o.date === dataVendaDe(c))
      if (!ehDaEntrega) continue
      vendeu.add(o.route)
      for (const p of o.produtos || []) if (prodMap.has(Number(p.codigo))) soma(firme, Number(p.codigo), Number(p.quant) || 0)
    }
    // Estimado: rotas do calendário que ainda não venderam para E.
    for (const c of rotasDoDia) {
      if (vendeu.has(c.rota)) { info?.push({ entrega: E, rota: c.rota, situacao: 'vendida' }); continue }
      const alvo = dataVendaDe(c)
      const historico = vendas.filter(v => v.route === c.rota && v.date < dataProducao && v.date !== alvo && dt(v.date).getDay() === c.dia_venda)
      const dias = new Set(historico.map(v => v.date))
      if (dias.size === 0) { info?.push({ entrega: E, rota: c.rota, situacao: 'sem histórico' }); continue }
      const totais = new Map()
      for (const v of historico) for (const it of itensPorVenda.get(v.id) || []) if (prodMap.has(Number(it.erp_code))) soma(totais, Number(it.erp_code), Number(it.quant) || 0)
      const fator = (1 + (Number(c.margem) || 0) / 100) / dias.size
      for (const [cod, q] of totais) {
        const linha = linhaMap.get(prodMap.get(cod).linha)
        if (linha && !linha.so_pedido) soma(estimado, cod, q * fator)
      }
      info?.push({ entrega: E, rota: c.rota, situacao: `média de ${dias.size} ${dias.size === 1 ? 'dia' : 'dias'} +${num(c.margem)}%` })
    }
    return { firme, estimado }
  }

  const firme = new Map(), estimado = new Map(), rotasInfo = []
  for (const E of entregas) {
    const d = demanda(E, rotasInfo)
    for (const [k, q] of d.firme) soma(firme, k, q)
    for (const [k, q] of d.estimado) soma(estimado, k, q)
  }

  // Estoque: última contagem fechada antes do dia da produção (até 4 dias antes).
  // A contagem do dia C já separou a carga de C+1; o que ainda vai sair entre C+2 e a véspera
  // da primeira entrega deste plano fica reservado. Só a sobra é descontada da produção.
  const estoqueLivre = new Map()
  let estoqueInfo = null
  if (entregas.length) {
    const { data: cont } = await supabase.from('estoque_contagens').select('id,data')
      .eq('status', 'fechada').lt('data', dataProducao).gte('data', somaDias(dataProducao, -4))
      .order('data', { ascending: false }).limit(1)
    const C = cont?.[0]
    if (C) {
      const { data: its } = await supabase.from('estoque_contagem_itens').select('erp_code,total').eq('contagem_id', C.id)
      const contado = new Map((its || []).map(i => [Number(i.erp_code), Number(i.total) || 0]))
      const reservadas = []
      for (let E = somaDias(C.data, 2); E < entregas[0]; E = somaDias(E, 1)) if (diasComEntrega.has(dt(E).getDay())) reservadas.push(E)
      const reservado = new Map()
      for (const E of reservadas) {
        const d = demanda(E, null)
        for (const [k, q] of d.firme) soma(reservado, k, q)
        for (const [k, q] of d.estimado) soma(reservado, k, q)
      }
      for (const [k, q] of contado) estoqueLivre.set(k, Math.max(0, q - (reservado.get(k) || 0)))
      estoqueInfo = { data: C.data, reservadas }
    }
  }
  // Monta os itens do plano (só produtos cadastrados em linhas ativas).
  const { data: nomes } = await supabase.from('products').select('erp_code,descricao').in('erp_code', [...prodMap.keys()])
  const descr = new Map((nomes || []).map(n => [Number(n.erp_code), n.descricao]))
  const lista = []
  for (const [cod, p] of prodMap) {
    if (!linhaMap.has(p.linha)) continue
    // arredonda para cima, ignorando sobras de ponto flutuante (110 × 1,10 = 121,0000000001)
    const cima = v => Math.ceil((v || 0) - 1e-6)
    const f = cima(firme.get(cod)), es = cima(estimado.get(cod)), est = Math.floor((estoqueLivre.get(cod) || 0) + 1e-6)
    const sug = Math.max(0, f + es - est)
    lista.push({ erp_code: cod, descricao: descr.get(cod) || `Produto ${cod}`, linha: p.linha, firme: f, estimado: es, estoque: est, sugerido: sug, planejado: sug, produzido: null })
  }
  return { entregas, itens: lista, rotasInfo, estoqueInfo }
}

// ---------------------------------------------------------------------------
function TabelaPlano({ itens, linhas, produtos = [], editarPlanejado, editarProduzido, onChange }) {
  const rendProd = new Map(produtos.map(p => [Number(p.erp_code), Number(p.rendimento_receita) || null]))
  const grupos = useMemo(() => {
    const ord = [...linhas].sort((a, b) => a.ordem - b.ordem)
    return ord.map(l => ({ linha: l, itens: itens.filter(i => i.linha === l.nome).sort((a, b) => a.descricao.localeCompare(b.descricao)) })).filter(g => g.itens.length)
  }, [itens, linhas])
  const cel = { padding: '6px 4px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }
  const numInput = { ...input, width: 64, padding: '4px 6px', fontSize: 13, textAlign: 'right' }
  return grupos.map(({ linha, itens: its }) => {
    const totPlan = its.reduce((a, i) => a + Number(i.planejado || 0), 0)
    const totProd = its.reduce((a, i) => a + Number(i.produzido || 0), 0)
    // Receitas da massa = soma de (quantidade ÷ rendimento do produto; vazio = padrão da linha)
    const rec = meiaReceita(its.reduce((a, i) => a + Number(i.planejado || 0) / (rendProd.get(Number(i.erp_code)) || Number(linha.rendimento_receita)), 0))
    const passou = linha.limite_receitas && rec > Number(linha.limite_receitas)
    return <div key={linha.nome} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{linha.nome}{linha.so_pedido && <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}> · só pedido</span>}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: passou ? DANGER : ACCENT }}>
          {num(rec, 1)} receita{rec === 1 ? '' : 's'}{linha.limite_receitas ? ` / limite ${num(linha.limite_receitas)}` : ''}
        </div>
      </div>
      {passou && <div style={{ fontSize: 12, color: DANGER, background: '#FEF2F2', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
        Passa do limite em {num(rec - linha.limite_receitas, 1)} receita(s). Adiante a diferença nos dias anteriores ou deixe os itens menos importantes por último.
      </div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: MUTED }}>
            <th style={{ ...cel, textAlign: 'left' }}>Produto</th><th style={cel}>Firme</th><th style={cel}>Estim.</th><th style={cel}>Estoque</th><th style={cel}>Sugerido</th><th style={cel}>Planejado</th>{(editarProduzido || its.some(i => i.produzido != null)) && <th style={cel}>Produzido</th>}
          </tr></thead>
          <tbody>{its.map(i => <tr key={i.erp_code} style={{ borderTop: `1px solid ${BORDER}` }}>
            <td style={{ ...cel, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600, color: TEXT }}>{i.descricao}</td>
            <td style={cel}>{num(i.firme)}</td>
            <td style={{ ...cel, color: MUTED }}>{num(i.estimado)}</td>
            <td style={{ ...cel, color: i.estoque ? SUCCESS : MUTED }}>{i.estoque ? `−${num(i.estoque)}` : '—'}</td>
            <td style={{ ...cel, fontWeight: 700 }}>{num(i.sugerido)}</td>
            <td style={cel}>{editarPlanejado
              ? <input type="number" inputMode="numeric" style={numInput} value={i.planejado ?? ''} onChange={e => onChange(i.erp_code, 'planejado', e.target.value === '' ? 0 : Number(e.target.value))} />
              : <b>{num(i.planejado)}</b>}</td>
            {(editarProduzido || its.some(x => x.produzido != null)) && <td style={cel}>{editarProduzido
              ? <input type="number" inputMode="numeric" style={{ ...numInput, borderColor: i.produzido != null ? SUCCESS : BORDER }} value={i.produzido ?? ''} placeholder="—" onChange={e => onChange(i.erp_code, 'produzido', e.target.value === '' ? null : Number(e.target.value))} />
              : <span style={{ color: i.produzido != null && i.produzido < i.planejado ? WARNING : SUCCESS, fontWeight: 700 }}>{i.produzido != null ? num(i.produzido) : '—'}</span>}</td>}
          </tr>)}</tbody>
          <tfoot><tr style={{ borderTop: `2px solid ${BORDER}`, color: MUTED }}>
            <td style={{ ...cel, textAlign: 'left' }}>Total</td><td style={cel}>{num(its.reduce((a, i) => a + i.firme, 0))}</td><td style={cel}>{num(its.reduce((a, i) => a + i.estimado, 0))}</td><td style={cel}>{num(its.reduce((a, i) => a + (i.estoque || 0), 0))}</td>
            <td style={cel}>{num(its.reduce((a, i) => a + i.sugerido, 0))}</td><td style={{ ...cel, color: TEXT, fontWeight: 800 }}>{num(totPlan)}</td>
            {(editarProduzido || its.some(i => i.produzido != null)) && <td style={{ ...cel, color: TEXT, fontWeight: 800 }}>{num(totProd)}</td>}
          </tr></tfoot>
        </table>
      </div>
    </div>
  })
}

// ---------------------------------------------------------------------------
function PlanoDoDia({ supabase, pode, showToast, cadastro }) {
  const [data, setData] = useState(hojeLocal())
  const [plano, setPlano] = useState(null)       // registro salvo (ou null)
  const [itens, setItens] = useState([])
  const [rotasInfo, setRotasInfo] = useState([])
  const [estoqueInfo, setEstoqueInfo] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const entregas = entregasDaProducao(data)
  const podeEditar = pode('producao.editar'), podeRegistrar = pode('producao.registrar')

  const carregar = async () => {
    setCarregando(true); setRotasInfo([]); setEstoqueInfo(null); setAlterado(false)
    const { data: p } = await supabase.from('prod_planos').select('*').eq('data_producao', data).maybeSingle()
    setPlano(p || null)
    if (p) {
      const { data: its } = await supabase.from('prod_plano_itens').select('*').eq('plano_id', p.id)
      setItens((its || []).map(i => ({ ...i, firme: Number(i.firme), estimado: Number(i.estimado), estoque: Number(i.estoque || 0), sugerido: Number(i.sugerido), planejado: Number(i.planejado), produzido: i.produzido == null ? null : Number(i.produzido) })))
    } else setItens([])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [data])

  const calcular = async () => {
    if (plano && plano.status !== 'rascunho') return
    if (alterado && !window.confirm('Recalcular apaga os ajustes feitos no planejado. Continuar?')) return
    setCalculando(true)
    try {
      const r = await calcularSugestao(supabase, data, cadastro)
      setItens(r.itens); setRotasInfo(r.rotasInfo); setEstoqueInfo(r.estoqueInfo || { semContagem: true }); setAlterado(true)
      if (r.itens.length === 0) showToast('Nenhum produto cadastrado nas linhas. Configure em Produção → Configuração.', 'error')
    } catch (e) { showToast('Erro ao calcular: ' + e.message, 'error') }
    setCalculando(false)
  }

  const mudar = (cod, campo, valor) => { setItens(prev => prev.map(i => i.erp_code === cod ? { ...i, [campo]: valor } : i)); setAlterado(true) }

  const salvarPlano = async (status) => {
    if (itens.length === 0) { showToast('Calcule a sugestão primeiro.', 'error'); return }
    setSalvando(true)
    try {
      let id = plano?.id
      const campos = { data_producao: data, entregas, status, ...(estoqueInfo ? { contagem_data: estoqueInfo.data || null } : {}), ...(status === 'aprovado' ? { aprovado_em: new Date().toISOString() } : {}) }
      if (id) {
        const { error } = await supabase.from('prod_planos').update(campos).eq('id', id); if (error) throw error
        const { error: e2 } = await supabase.from('prod_plano_itens').delete().eq('plano_id', id); if (e2) throw e2
      } else {
        const { data: novo, error } = await supabase.from('prod_planos').insert(campos).select('id').single(); if (error) throw error
        id = novo.id
      }
      const linhasItens = itens.map(i => ({ plano_id: id, erp_code: i.erp_code, descricao: i.descricao, linha: i.linha, firme: i.firme, estimado: i.estimado, estoque: i.estoque || 0, sugerido: i.sugerido, planejado: Number(i.planejado) || 0 }))
      const { error: e3 } = await supabase.from('prod_plano_itens').insert(linhasItens); if (e3) throw e3
      showToast(status === 'aprovado' ? 'Plano aprovado! O padeiro já pode registrar.' : 'Rascunho salvo.')
      await carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  const reabrir = async () => {
    if (!window.confirm('Voltar o plano para rascunho? O que já foi registrado como produzido fica guardado até recalcular.')) return
    const { error } = await supabase.from('prod_planos').update({ status: 'rascunho', aprovado_em: null }).eq('id', plano.id)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await carregar()
  }

  const salvarProduzido = async (concluir) => {
    setSalvando(true)
    try {
      for (const i of itens) {
        const { error } = await supabase.from('prod_plano_itens').update({ produzido: i.produzido }).eq('plano_id', plano.id).eq('erp_code', i.erp_code)
        if (error) throw error
      }
      if (concluir) {
        const { error } = await supabase.from('prod_planos').update({ status: 'concluido', concluido_em: new Date().toISOString() }).eq('id', plano.id)
        if (error) throw error
      }
      showToast(concluir ? 'Produção concluída!' : 'Produzido salvo.')
      await carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  const status = plano?.status || (itens.length ? 'novo' : null)
  const corStatus = { novo: MUTED, rascunho: WARNING, aprovado: ACCENT, concluido: SUCCESS }
  const nomeStatus = { novo: 'Não salvo', rascunho: 'Rascunho', aprovado: 'Aprovado', concluido: 'Concluído' }
  const emEdicao = podeEditar && (!plano || plano.status === 'rascunho')
  const registrando = podeRegistrar && plano && (plano.status === 'aprovado' || plano.status === 'concluido')

  return <div>
    <div style={card}>
      <label style={label}>DIA DA PRODUÇÃO</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={input} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{DIAS[dt(data).getDay()]}</span>
        {status && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: corStatus[status], border: `1px solid ${corStatus[status]}55`, background: corStatus[status] + '14', borderRadius: 6, padding: '3px 8px' }}>{nomeStatus[status]}</span>}
      </div>
      {plano?.contagem_data && <div style={{ fontSize: 12, color: SUCCESS, marginTop: 6 }}>📦 Calculado com a contagem de estoque de {curto(plano.contagem_data)}</div>}
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
        {entregas.length
          ? <>Atende as entregas de <b style={{ color: TEXT }}>{entregas.map(curto).join(' e ')}</b> (produz hoje, embala amanhã, entrega depois).</>
          : <span style={{ color: WARNING }}>{dt(data).getDay() === 5 ? 'Sexta é dia de biscoitos e roscas: sem plano de pão.' : 'Sem produção neste dia.'}</span>}
      </div>
    </div>

    {carregando && <div style={{ textAlign: 'center', color: MUTED, padding: 20, fontSize: 13 }}>⏳ Carregando…</div>}

    {!carregando && entregas.length > 0 && emEdicao && <button onClick={calcular} disabled={calculando} style={{ ...btn(ACCENT), width: '100%', marginBottom: 12, padding: '12px 0', fontSize: 14 }}>
      {calculando ? '⏳ Calculando…' : itens.length ? '🔄 Recalcular sugestão' : '🧮 Calcular sugestão de produção'}
    </button>}

    {!carregando && !plano && itens.length === 0 && !emEdicao && entregas.length > 0 &&
      <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>O plano deste dia ainda não foi aprovado.</div>}

    {rotasInfo.length > 0 && <div style={{ ...card, fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Como foi calculado</div>
      {estoqueInfo && (estoqueInfo.semContagem
        ? <div style={{ color: WARNING, fontWeight: 600, marginBottom: 6 }}>⚠️ Sem contagem de estoque fechada nos últimos dias: o estoque não foi descontado.</div>
        : <div style={{ color: SUCCESS, fontWeight: 600, marginBottom: 6 }}>📦 Estoque da contagem de {curto(estoqueInfo.data)}{estoqueInfo.reservadas.length ? `, já reservando o que sai em ${estoqueInfo.reservadas.map(curto).join(' e ')}` : ''}.</div>)}
      {rotasInfo.map((r, k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: k ? `1px solid ${BORDER}` : 'none' }}>
        <span>{curto(r.entrega)} · {r.rota}</span>
        <span style={{ color: r.situacao === 'vendida' ? SUCCESS : r.situacao === 'sem histórico' ? DANGER : MUTED, fontWeight: 600 }}>{r.situacao === 'vendida' ? 'pedidos firmes' : r.situacao}</span>
      </div>)}
    </div>}

    {itens.length > 0 && <TabelaPlano itens={itens} linhas={cadastro.linhas} produtos={cadastro.produtos} editarPlanejado={emEdicao} editarProduzido={registrando} onChange={mudar} />}

    {itens.length > 0 && emEdicao && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button onClick={() => salvarPlano('rascunho')} disabled={salvando} style={{ ...btn(SURFACE, ACCENT), flex: 1, border: `1px solid ${BORDER}` }}>💾 Salvar rascunho</button>
      <button onClick={() => salvarPlano('aprovado')} disabled={salvando} style={{ ...btn(SUCCESS), flex: 1 }}>✅ Aprovar plano</button>
    </div>}

    {registrando && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button onClick={() => salvarProduzido(false)} disabled={salvando} style={{ ...btn(SURFACE, ACCENT), flex: 1, border: `1px solid ${BORDER}` }}>💾 Salvar produzido</button>
      {plano.status === 'aprovado' && <button onClick={() => salvarProduzido(true)} disabled={salvando} style={{ ...btn(SUCCESS), flex: 1 }}>🏁 Concluir produção</button>}
    </div>}

    {podeEditar && plano?.status === 'aprovado' && <button onClick={reabrir} style={{ ...btn('none', MUTED), width: '100%', fontSize: 12 }}>↩ Voltar para rascunho</button>}
  </div>
}

// ---------------------------------------------------------------------------
function Configuracao({ supabase, showToast, cadastro, recarregar }) {
  const [aba, setAba] = useState('produtos')
  const [produtosErp, setProdutosErp] = useState([])
  const [busca, setBusca] = useState('')
  const [todos, setTodos] = useState(false)
  const [novaLinha, setNovaLinha] = useState({ nome: '', rendimento_receita: '' })
  const [novaRota, setNovaRota] = useState({ rota: '', dia_venda: 1, dia_entrega: 2, margem: 10 })

  useEffect(() => {
    supabase.from('products').select('erp_code,descricao,codigo_proprio,tags').order('descricao').then(({ data }) => setProdutosErp(data || []))
  }, [])

  const linhaDe = useMemo(() => new Map(cadastro.produtos.map(p => [Number(p.erp_code), p])), [cadastro.produtos])
  const listaProdutos = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return produtosErp.filter(p => (todos || linhaDe.has(Number(p.erp_code)) || (p.tags || []).includes('PROPRIO'))
      && (!b || `${p.descricao} ${p.codigo_proprio}`.toLowerCase().includes(b)))
  }, [produtosErp, busca, todos, linhaDe])

  const definirRendimento = async (erp, valor) => {
    const r = valor === '' ? null : Number(String(valor).replace(',', '.'))
    if (r !== null && !(r > 0)) { showToast('Rendimento inválido.', 'error'); return }
    const { error } = await supabase.from('prod_produtos').update({ rendimento_receita: r }).eq('erp_code', erp)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await recarregar()
  }
  const definirLinha = async (erp, linha) => {
    const { error } = linha
      ? await supabase.from('prod_produtos').upsert({ erp_code: erp, linha, ativo: true }, { onConflict: 'erp_code' })
      : await supabase.from('prod_produtos').delete().eq('erp_code', erp)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await recarregar()
  }
  const salvarLinha = async (nome, campos) => {
    const { error } = await supabase.from('prod_linhas').update(campos).eq('nome', nome)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await recarregar(); showToast('Linha atualizada.')
  }
  const criarLinha = async () => {
    const r = Number(String(novaLinha.rendimento_receita).replace(',', '.'))
    if (!novaLinha.nome.trim() || !(r > 0)) { showToast('Informe nome e rendimento por receita.', 'error'); return }
    const { error } = await supabase.from('prod_linhas').insert({ nome: novaLinha.nome.trim(), rendimento_receita: r, ordem: 100 + cadastro.linhas.length })
    if (error) { showToast(error.code === '23505' ? 'Já existe uma linha com esse nome.' : 'Erro: ' + error.message, 'error'); return }
    setNovaLinha({ nome: '', rendimento_receita: '' }); await recarregar(); showToast('Linha criada.')
  }
  const salvarRota = async (id, campos) => {
    const { error } = await supabase.from('prod_calendario').update(campos).eq('id', id)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await recarregar()
  }
  const criarRota = async () => {
    if (!novaRota.rota.trim()) { showToast('Informe a rota.', 'error'); return }
    const { error } = await supabase.from('prod_calendario').insert({ ...novaRota, rota: novaRota.rota.trim().toUpperCase(), margem: Number(novaRota.margem) || 0 })
    if (error) { showToast(error.code === '23505' ? 'Essa rota já está nesse dia.' : 'Erro: ' + error.message, 'error'); return }
    setNovaRota({ rota: '', dia_venda: 1, dia_entrega: 2, margem: 10 }); await recarregar(); showToast('Rota adicionada.')
  }
  const removerRota = async (id) => {
    if (!window.confirm('Remover esta linha do calendário?')) return
    const { error } = await supabase.from('prod_calendario').delete().eq('id', id)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await recarregar()
  }

  const SubAba = ({ id, children }) => <button onClick={() => setAba(id)} style={{ flex: 1, border: 'none', borderBottom: `3px solid ${aba === id ? ACCENT : 'transparent'}`, background: 'none', padding: '8px 0', fontWeight: 700, fontSize: 13, color: aba === id ? ACCENT : MUTED, cursor: 'pointer' }}>{children}</button>
  const linhasOrd = [...cadastro.linhas].sort((a, b) => a.ordem - b.ordem)

  return <div>
    <div style={{ display: 'flex', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <SubAba id="produtos">Produtos</SubAba><SubAba id="linhas">Linhas</SubAba><SubAba id="calendario">Calendário</SubAba>
    </div>

    {aba === 'produtos' && <div>
      <div style={{ ...card, fontSize: 12, color: MUTED }}>Escolha a linha (massa) de cada produto que a fábrica produz. Produtos sem linha não entram no plano (ex.: bolos e broinha terceirizados).<br />O número ao lado é quantas <b>unidades deste produto</b> uma receita rende. Deixe vazio para usar o padrão da linha (aparece em cinza); preencha quando o peso muda (ex.: Maluquinho 200g rende o dobro do 400g).</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: MUTED, marginBottom: 10 }}>
        <input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Mostrar todos os produtos (não só os de produção própria)
      </label>
      {listaProdutos.map(p => {
        const cad = linhaDe.get(Number(p.erp_code))
        const atual = cad?.linha || ''
        const padrao = cadastro.linhas.find(l => l.nome === atual)?.rendimento_receita
        return <div key={p.erp_code} style={{ ...card, padding: '10px 12px', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', borderColor: atual ? ACCENT + '55' : BORDER }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.descricao}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{p.codigo_proprio || `cód. ${p.erp_code}`}</div>
          </div>
          <select value={atual} onChange={e => definirLinha(Number(p.erp_code), e.target.value)} style={{ ...input, padding: '6px 8px', fontSize: 13, maxWidth: 140 }}>
            <option value="">— não produz</option>
            {linhasOrd.filter(l => l.ativo || l.nome === atual).map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
          </select>
          {atual && <input key={`${p.erp_code}-${cad?.rendimento_receita ?? ''}`} type="number" inputMode="numeric" title="Unidades por receita (vazio = padrão da linha)"
            placeholder={padrao ? `${num(padrao)}` : 'un./rec.'} defaultValue={cad?.rendimento_receita ?? ''}
            onBlur={e => { const v = e.target.value; if (String(v) !== String(cad?.rendimento_receita ?? '')) definirRendimento(Number(p.erp_code), v) }}
            style={{ ...input, width: 62, padding: '6px 6px', fontSize: 13, textAlign: 'right', borderColor: cad?.rendimento_receita ? ACCENT : BORDER }} />}
        </div>
      })}
      {listaProdutos.length === 0 && <div style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: 16 }}>Nenhum produto encontrado.</div>}
    </div>}

    {aba === 'linhas' && <div>
      {linhasOrd.map(l => <LinhaEdit key={l.nome} linha={l} qtd={cadastro.produtos.filter(p => p.linha === l.nome).length} onSalvar={c => salvarLinha(l.nome, c)} />)}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>➕ Nova linha</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...input, flex: 2 }} placeholder="Nome (ex.: Rosca)" value={novaLinha.nome} onChange={e => setNovaLinha(p => ({ ...p, nome: e.target.value }))} />
          <input style={{ ...input, flex: 1, width: 0 }} type="number" placeholder="Un./receita" value={novaLinha.rendimento_receita} onChange={e => setNovaLinha(p => ({ ...p, rendimento_receita: e.target.value }))} />
          <button style={btn(SUCCESS)} onClick={criarLinha}>Criar</button>
        </div>
      </div>
    </div>}

    {aba === 'calendario' && <div>
      <div style={{ ...card, fontSize: 12, color: MUTED }}>Dia em que cada rota vende e entrega. A sugestão usa a média das vendas da rota no dia da venda (últimas {SEMANAS_HISTORICO} semanas) e soma a margem.</div>
      {[...cadastro.calendario].sort((a, b) => a.dia_entrega - b.dia_entrega || a.rota.localeCompare(b.rota)).map(c => <div key={c.id} style={{ ...card, padding: '10px 12px', marginBottom: 6, opacity: c.ativo ? 1 : 0.55 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <b style={{ fontSize: 13 }}>{c.rota}</b>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: MUTED, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={c.ativo} onChange={e => salvarRota(c.id, { ativo: e.target.checked })} /> ativa</label>
            <button onClick={() => removerRota(c.id)} style={{ background: 'none', border: 'none', color: DANGER, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: MUTED }}>Vende</span>
          <select value={c.dia_venda} onChange={e => salvarRota(c.id, { dia_venda: Number(e.target.value) })} style={{ ...input, padding: '4px 6px', fontSize: 12 }}>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <span style={{ color: MUTED }}>entrega</span>
          <select value={c.dia_entrega} onChange={e => salvarRota(c.id, { dia_entrega: Number(e.target.value) })} style={{ ...input, padding: '4px 6px', fontSize: 12 }}>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <span style={{ color: MUTED }}>+</span>
          <input type="number" defaultValue={c.margem} onBlur={e => Number(e.target.value) !== Number(c.margem) && salvarRota(c.id, { margem: Number(e.target.value) || 0 })} style={{ ...input, width: 52, padding: '4px 6px', fontSize: 12 }} />
          <span style={{ color: MUTED }}>%</span>
        </div>
      </div>)}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>➕ Adicionar rota ao calendário</div>
        <input style={{ ...input, width: '100%', marginBottom: 8 }} placeholder="Rota (como está nas palavras-chave do eGestor)" value={novaRota.rota} onChange={e => setNovaRota(p => ({ ...p, rota: e.target.value }))} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: MUTED }}>Vende</span>
          <select value={novaRota.dia_venda} onChange={e => setNovaRota(p => ({ ...p, dia_venda: Number(e.target.value) }))} style={{ ...input, padding: '4px 6px', fontSize: 12 }}>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <span style={{ color: MUTED }}>entrega</span>
          <select value={novaRota.dia_entrega} onChange={e => setNovaRota(p => ({ ...p, dia_entrega: Number(e.target.value) }))} style={{ ...input, padding: '4px 6px', fontSize: 12 }}>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          <span style={{ color: MUTED }}>+</span>
          <input type="number" value={novaRota.margem} onChange={e => setNovaRota(p => ({ ...p, margem: e.target.value }))} style={{ ...input, width: 52, padding: '4px 6px', fontSize: 12 }} />
          <span style={{ color: MUTED }}>%</span>
        </div>
        <button style={{ ...btn(SUCCESS), width: '100%' }} onClick={criarRota}>Adicionar</button>
      </div>
    </div>}
  </div>
}

function LinhaEdit({ linha, qtd, onSalvar }) {
  const [f, setF] = useState({ rendimento_receita: linha.rendimento_receita, limite_receitas: linha.limite_receitas ?? '', so_pedido: linha.so_pedido, ativo: linha.ativo, ordem: linha.ordem })
  const mudou = Number(f.rendimento_receita) !== Number(linha.rendimento_receita) || String(f.limite_receitas ?? '') !== String(linha.limite_receitas ?? '') || f.so_pedido !== linha.so_pedido || f.ativo !== linha.ativo || Number(f.ordem) !== Number(linha.ordem)
  return <div style={{ ...card, opacity: f.ativo ? 1 : 0.6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <b style={{ fontSize: 14 }}>{linha.nome}</b><span style={{ fontSize: 11, color: MUTED }}>{qtd} produto(s)</span>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div><label style={label}>UN./RECEITA (PADRÃO)</label><input type="number" style={{ ...input, width: 80 }} value={f.rendimento_receita} onChange={e => setF(p => ({ ...p, rendimento_receita: e.target.value }))} /></div>
      <div><label style={label}>LIMITE/DIA</label><input type="number" placeholder="—" style={{ ...input, width: 80 }} value={f.limite_receitas} onChange={e => setF(p => ({ ...p, limite_receitas: e.target.value }))} /></div>
      <div><label style={label}>ORDEM</label><input type="number" style={{ ...input, width: 64 }} value={f.ordem} onChange={e => setF(p => ({ ...p, ordem: e.target.value }))} /></div>
    </div>
    <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.so_pedido} onChange={e => setF(p => ({ ...p, so_pedido: e.target.checked }))} /> Só com pedido firme</label>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.ativo} onChange={e => setF(p => ({ ...p, ativo: e.target.checked }))} /> Ativa</label>
    </div>
    {mudou && <button style={{ ...btn(ACCENT), width: '100%', marginTop: 10 }} onClick={() => {
      const r = Number(f.rendimento_receita)
      if (!(r > 0)) return
      onSalvar({ rendimento_receita: r, limite_receitas: f.limite_receitas === '' ? null : Number(f.limite_receitas), so_pedido: f.so_pedido, ativo: f.ativo, ordem: Number(f.ordem) || 100 })
    }}>Salvar</button>}
  </div>
}

// ---------------------------------------------------------------------------
export default function Producao({ supabase, pode, showToast }) {
  const [aba, setAba] = useState('plano')
  const [cadastro, setCadastro] = useState({ linhas: [], produtos: [], calendario: [] })
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')

  const recarregar = async () => {
    const [l, p, c] = await Promise.all([
      supabase.from('prod_linhas').select('*'),
      supabase.from('prod_produtos').select('*'),
      supabase.from('prod_calendario').select('*')
    ])
    if (l.error || p.error || c.error) { setErro((l.error || p.error || c.error).message); setPronto(true); return }
    setCadastro({ linhas: l.data || [], produtos: p.data || [], calendario: c.data || [] })
    setErro(''); setPronto(true)
  }
  useEffect(() => { recarregar() }, [])

  const Aba = ({ id, children }) => <button onClick={() => setAba(id)} style={{ flex: 1, border: 'none', borderBottom: `3px solid ${aba === id ? ACCENT : 'transparent'}`, background: 'none', padding: '10px 0', fontWeight: 700, fontSize: 14, color: aba === id ? ACCENT : MUTED, cursor: 'pointer' }}>{children}</button>

  if (!pronto) return <div style={{ textAlign: 'center', color: MUTED, padding: 30, fontSize: 13 }}>⏳ Carregando produção…</div>
  if (erro) return <div style={{ ...card, color: DANGER, fontSize: 13 }}>Não foi possível abrir a Produção: {erro}<br /><span style={{ color: MUTED }}>Se a mensagem fala de tabela inexistente, falta aplicar a migração 005 no banco.</span></div>

  return <div>
    {pode('producao.editar') && <div style={{ display: 'flex', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <Aba id="plano">🍞 Plano do dia</Aba>
      <Aba id="config">⚙️ Configuração</Aba>
    </div>}
    {aba === 'plano' || !pode('producao.editar')
      ? <PlanoDoDia supabase={supabase} pode={pode} showToast={showToast} cadastro={cadastro} />
      : <Configuracao supabase={supabase} showToast={showToast} cadastro={cadastro} recarregar={recarregar} />}
  </div>
}
