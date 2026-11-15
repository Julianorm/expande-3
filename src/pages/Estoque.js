// eXpande 3.0 — Contagem de estoque no fim do dia.
// Estoque = embalado que sobrou no depósito (depois de separar a carga do dia seguinte)
//         + produzido ainda não embalado. O plano de produção desconta a última contagem fechada.
import { useEffect, useMemo, useState } from 'react'

const ACCENT = '#2563EB', SUCCESS = '#16A34A', WARNING = '#D97706', DANGER = '#DC2626'
const SURFACE = '#F8FAFC', CARD = '#FFFFFF', BORDER = '#E2E8F0', MUTED = '#64748B', TEXT = '#0F172A'
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }
const input = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, background: CARD, boxSizing: 'border-box' }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' })
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dt = s => new Date(s + 'T12:00:00')
const br = s => dt(s).toLocaleDateString('pt-BR')
const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const n = v => (v === '' || v == null ? 0 : Number(v) || 0)

export default function Estoque({ supabase, pode, showToast }) {
  const [data, setData] = useState(iso(new Date()))
  const [contagem, setContagem] = useState(null)
  const [base, setBase] = useState([])          // produtos da produção: {erp_code, descricao, linha, ordem}
  const [valores, setValores] = useState({})    // erp_code -> {embalado, nao_embalado, descricao}
  const [extras, setExtras] = useState([])      // outros produtos acrescentados à mão
  const [historico, setHistorico] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [busca, setBusca] = useState('')
  const [todosProdutos, setTodosProdutos] = useState([])
  const [mostrarBusca, setMostrarBusca] = useState(false)

  const podeContar = pode('estoque.contar'), podeAjustar = pode('estoque.ajustar')
  const fechada = contagem?.status === 'fechada'
  const editavel = !fechada && (podeContar || podeAjustar)

  // Lista base: produtos cadastrados nas linhas da Produção.
  useEffect(() => {
    (async () => {
      const [{ data: pp }, { data: ln }] = await Promise.all([
        supabase.from('prod_produtos').select('erp_code,linha,ativo'),
        supabase.from('prod_linhas').select('nome,ordem')
      ])
      const ativos = (pp || []).filter(p => p.ativo)
      const { data: nomes } = ativos.length
        ? await supabase.from('products').select('erp_code,descricao').in('erp_code', ativos.map(p => p.erp_code))
        : { data: [] }
      const ordem = new Map((ln || []).map(l => [l.nome, l.ordem]))
      const desc = new Map((nomes || []).map(x => [Number(x.erp_code), x.descricao]))
      setBase(ativos.map(p => ({ erp_code: Number(p.erp_code), linha: p.linha, ordem: ordem.get(p.linha) ?? 999, descricao: desc.get(Number(p.erp_code)) || `Produto ${p.erp_code}` })))
    })()
  }, [])

  const carregar = async () => {
    setCarregando(true); setAlterado(false)
    const { data: c } = await supabase.from('estoque_contagens').select('*').eq('data', data).maybeSingle()
    setContagem(c || null)
    const v = {}, ex = []
    if (c) {
      const { data: its } = await supabase.from('estoque_contagem_itens').select('*').eq('contagem_id', c.id)
      for (const i of its || []) v[i.erp_code] = { embalado: Number(i.embalado), nao_embalado: Number(i.nao_embalado), descricao: i.descricao }
      for (const i of its || []) ex.push({ erp_code: Number(i.erp_code), descricao: i.descricao || `Produto ${i.erp_code}` })
    } else {
      // Contagem nova: já traz os produtos contados na última contagem (ex.: biscoitos e roscas
      // acrescentados à mão), para não precisar incluir de novo todo dia. Valores começam vazios.
      const { data: ant } = await supabase.from('estoque_contagens').select('id').lt('data', data).order('data', { ascending: false }).limit(1)
      if (ant?.[0]) {
        const { data: its } = await supabase.from('estoque_contagem_itens').select('erp_code,descricao').eq('contagem_id', ant[0].id)
        for (const i of its || []) ex.push({ erp_code: Number(i.erp_code), descricao: i.descricao || `Produto ${i.erp_code}` })
      }
    }
    setValores(v); setExtras(ex)
    const { data: h } = await supabase.from('estoque_contagens').select('id,data,status,fechado_em').order('data', { ascending: false }).limit(10)
    setHistorico(h || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [data])

  // Produtos mostrados = base + extras que não estão na base.
  const grupos = useMemo(() => {
    const naBase = new Set(base.map(b => b.erp_code))
    const outros = extras.filter(e => !naBase.has(e.erp_code)).map(e => ({ ...e, linha: 'Outros produtos', ordem: 9999 }))
    const todos = [...base, ...outros]
    const mapa = new Map()
    for (const p of todos) { if (!mapa.has(p.linha)) mapa.set(p.linha, { linha: p.linha, ordem: p.ordem, itens: [] }); mapa.get(p.linha).itens.push(p) }
    return [...mapa.values()].sort((a, b) => a.ordem - b.ordem).map(g => ({ ...g, itens: g.itens.sort((a, b) => a.descricao.localeCompare(b.descricao)) }))
  }, [base, extras])
  const listaTodos = grupos.flatMap(g => g.itens)
  const preenchidos = listaTodos.filter(p => valores[p.erp_code] && (valores[p.erp_code].embalado !== '' || valores[p.erp_code].nao_embalado !== '')).length

  const mudar = (p, campo, v) => {
    setValores(prev => ({ ...prev, [p.erp_code]: { embalado: '', nao_embalado: '', ...prev[p.erp_code], descricao: p.descricao, [campo]: v } }))
    setAlterado(true)
  }

  const salvar = async (fechar) => {
    if (listaTodos.length === 0) { showToast('Nenhum produto para contar. Cadastre os produtos em Produção → Configuração.', 'error'); return }
    if (fechar && preenchidos < listaTodos.length && !window.confirm(`Faltam ${listaTodos.length - preenchidos} produto(s) sem contagem. Eles ficam como 0. Fechar mesmo assim?`)) return
    setSalvando(true)
    try {
      let id = contagem?.id
      if (!id) {
        const { data: nova, error } = await supabase.from('estoque_contagens').insert({ data, status: 'aberta' }).select('id').single()
        if (error) throw error
        id = nova.id
      }
      const linhas = listaTodos.map(p => ({ contagem_id: id, erp_code: p.erp_code, descricao: p.descricao, embalado: n(valores[p.erp_code]?.embalado), nao_embalado: n(valores[p.erp_code]?.nao_embalado) }))
      const { error: e2 } = await supabase.from('estoque_contagem_itens').upsert(linhas, { onConflict: 'contagem_id,erp_code' })
      if (e2) throw e2
      if (fechar) {
        const { error: e3 } = await supabase.from('estoque_contagens').update({ status: 'fechada', fechado_em: new Date().toISOString() }).eq('id', id)
        if (e3) throw e3
      }
      showToast(fechar ? 'Contagem fechada! A produção já usa esses números.' : 'Contagem salva.')
      await carregar()
    } catch (e) { showToast('Erro: ' + e.message, 'error') }
    setSalvando(false)
  }

  const reabrir = async () => {
    if (!window.confirm('Reabrir esta contagem para corrigir?')) return
    const { error } = await supabase.from('estoque_contagens').update({ status: 'aberta', fechado_em: null }).eq('id', contagem.id)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    await carregar()
  }

  const removerExtra = async (cod) => {
    setExtras(prev => prev.filter(e => e.erp_code !== cod))
    setValores(prev => { const c = { ...prev }; delete c[cod]; return c })
    if (contagem?.id) await supabase.from('estoque_contagem_itens').delete().eq('contagem_id', contagem.id).eq('erp_code', cod)
    setAlterado(true)
  }
  const abrirBusca = async () => {
    setMostrarBusca(true)
    if (todosProdutos.length === 0) {
      const { data: pr } = await supabase.from('products').select('erp_code,descricao,codigo_proprio').order('descricao')
      setTodosProdutos(pr || [])
    }
  }
  const acrescentar = p => {
    const cod = Number(p.erp_code)
    if (!listaTodos.some(x => x.erp_code === cod)) setExtras(prev => [...prev, { erp_code: cod, descricao: p.descricao }])
    setBusca(''); setMostrarBusca(false); setAlterado(true)
  }
  const resultadosBusca = busca.trim().length >= 2
    ? todosProdutos.filter(p => `${p.descricao} ${p.codigo_proprio}`.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 15) : []

  const numInput = { ...input, width: 70, padding: '6px 8px', textAlign: 'right' }
  const totalGeral = listaTodos.reduce((a, p) => a + n(valores[p.erp_code]?.embalado) + n(valores[p.erp_code]?.nao_embalado), 0)

  return <div>
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 4 }}>DIA DA CONTAGEM (FIM DO DIA)</div>
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={input} />
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{DIAS[dt(data).getDay()]}</div>
          {contagem
            ? <span style={{ fontSize: 11, fontWeight: 700, color: fechada ? SUCCESS : WARNING }}>{fechada ? '✓ Fechada' : 'Em andamento'}</span>
            : <span style={{ fontSize: 11, color: MUTED }}>Ainda não contada</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
        Conte depois de separar a carga do dia seguinte: <b>embalado</b> que sobrou no depósito e <b>produzido ainda não embalado</b>.
      </div>
    </div>

    {carregando ? <div style={{ textAlign: 'center', color: MUTED, padding: 20, fontSize: 13 }}>⏳ Carregando…</div> : <>
      {listaTodos.length === 0 && <div style={{ ...card, fontSize: 13, color: MUTED }}>Nenhum produto cadastrado. Peça para cadastrar os produtos em <b>Produção → Configuração → Produtos</b>.</div>}

      {grupos.map(g => <div key={g.linha} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <b style={{ fontSize: 14 }}>{g.linha}</b>
          <span style={{ fontSize: 12, color: MUTED }}>{num(g.itens.reduce((a, p) => a + n(valores[p.erp_code]?.embalado) + n(valores[p.erp_code]?.nao_embalado), 0))} un.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 11, color: MUTED, fontWeight: 600, padding: '0 0 4px' }}>
          <span style={{ flex: 1 }}>Produto</span><span style={{ width: 74, textAlign: 'right' }}>Embalado</span><span style={{ width: 82, textAlign: 'right' }}>Não embal.</span><span style={{ width: 50, textAlign: 'right' }}>Total</span>
        </div>
        {g.itens.map(p => {
          const v = valores[p.erp_code] || {}
          return <div key={p.erp_code} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 0', borderTop: `1px solid ${BORDER}` }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: TEXT, minWidth: 0 }}>{p.descricao}{editavel && g.linha === 'Outros produtos' && <button onClick={() => removerExtra(p.erp_code)} title="Tirar da contagem" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 11, marginLeft: 4 }}>✕</button>}</span>
            {editavel
              ? <><input type="number" inputMode="numeric" placeholder="0" style={numInput} value={v.embalado ?? ''} onChange={e => mudar(p, 'embalado', e.target.value)} />
                <input type="number" inputMode="numeric" placeholder="0" style={{ ...numInput, width: 78 }} value={v.nao_embalado ?? ''} onChange={e => mudar(p, 'nao_embalado', e.target.value)} /></>
              : <><span style={{ width: 74, textAlign: 'right', fontSize: 13 }}>{num(v.embalado)}</span><span style={{ width: 82, textAlign: 'right', fontSize: 13 }}>{num(v.nao_embalado)}</span></>}
            <span style={{ width: 50, textAlign: 'right', fontSize: 13, fontWeight: 800 }}>{num(n(v.embalado) + n(v.nao_embalado))}</span>
          </div>
        })}
      </div>)}

      {editavel && <div style={{ ...card, padding: '10px 12px' }}>
        {!mostrarBusca
          ? <button onClick={abrirBusca} style={{ ...btn('none', ACCENT), padding: 0 }}>➕ Contar outro produto (biscoito, rosca…)</button>
          : <div>
            <input autoFocus style={{ ...input, width: '100%' }} placeholder="Digite o nome do produto…" value={busca} onChange={e => setBusca(e.target.value)} />
            {resultadosBusca.map(p => <div key={p.erp_code} onClick={() => acrescentar(p)} style={{ padding: '8px 4px', borderTop: `1px solid ${BORDER}`, fontSize: 13, cursor: 'pointer' }}>{p.descricao} <span style={{ color: MUTED, fontSize: 11 }}>{p.codigo_proprio}</span></div>)}
            <button onClick={() => { setMostrarBusca(false); setBusca('') }} style={{ ...btn('none', MUTED), padding: '6px 0', fontSize: 12 }}>Cancelar</button>
          </div>}
      </div>}

      {listaTodos.length > 0 && <div style={{ ...card, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: MUTED }}>{preenchidos} de {listaTodos.length} produtos preenchidos</span>
        <b>Total: {num(totalGeral)} un.</b>
      </div>}

      {editavel && listaTodos.length > 0 && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => salvar(false)} disabled={salvando} style={{ ...btn(SURFACE, ACCENT), flex: 1, border: `1px solid ${BORDER}` }}>💾 Salvar</button>
        <button onClick={() => salvar(true)} disabled={salvando} style={{ ...btn(SUCCESS), flex: 1 }}>✅ Fechar contagem</button>
      </div>}
      {fechada && podeAjustar && <button onClick={reabrir} style={{ ...btn('none', MUTED), width: '100%', fontSize: 12, marginBottom: 12 }}>↩ Reabrir para corrigir</button>}
      {fechada && !podeAjustar && <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 12 }}>Contagem fechada. Para corrigir, peça a quem pode ajustar o estoque.</div>}

      {historico.length > 0 && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Últimas contagens</div>
        {historico.map(h => <div key={h.id} onClick={() => setData(h.data)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${BORDER}`, fontSize: 13, cursor: 'pointer', fontWeight: h.data === data ? 700 : 400 }}>
          <span>{DIAS[dt(h.data).getDay()].slice(0, 3)} {br(h.data)}</span>
          <span style={{ color: h.status === 'fechada' ? SUCCESS : WARNING, fontSize: 12, fontWeight: 600 }}>{h.status === 'fechada' ? 'Fechada' : 'Em andamento'}</span>
        </div>)}
      </div>}
    </>}
  </div>
}
