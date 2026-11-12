// eXpande 3.0 — Metas e datas de entrega definidas pelo escritório (permissão vendas.metas).
// Grava em daily_goals (user_id + rota + dia), a mesma tabela que o vendedor usa na 2.0.
import { useEffect, useState } from 'react'

const ACCENT = '#2563EB', SUCCESS = '#16A34A', WARNING = '#D97706'
const CARD = '#FFFFFF', BORDER = '#E2E8F0', MUTED = '#64748B', SURFACE = '#F8FAFC'
// Mesmo "hoje" que o app usa para o vendedor (data em UTC), para os dois lados baterem.
const hoje = () => new Date().toISOString().split('T')[0]
const proximoDiaUtil = (d) => {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() + (x.getDay() === 5 ? 3 : x.getDay() === 6 ? 2 : 1))
  return x.toISOString().split('T')[0]
}
const chave = (uid, rota) => `${uid}|${rota}`

export default function MetasDoDia({ supabase, showToast, rota }) {
  const [data, setData] = useState(hoje())
  const [vendedores, setVendedores] = useState([])
  const [valores, setValores] = useState({}) // chave -> {meta, entrega, salvo}
  const [aberto, setAberto] = useState(true)
  const [salvando, setSalvando] = useState('')

  const carregar = async () => {
    const [{ data: cfg }, { data: metas }] = await Promise.all([
      supabase.from('user_config').select('user_id, name, rotas, perfil, egestor_vendedor_code'),
      supabase.from('daily_goals').select('user_id, route, goal_value, dt_entrega').eq('date', data)
    ])
    const vend = (cfg || [])
      .filter(u => u.perfil !== 'entregador' && u.perfil !== 'admin' && (u.rotas || []).length > 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    setVendedores(vend)
    const v = {}
    for (const u of vend) for (const r of u.rotas) v[chave(u.user_id, r)] = { meta: '', entrega: proximoDiaUtil(data), salvo: false }
    for (const m of metas || []) v[chave(m.user_id, m.route)] = { meta: String(m.goal_value ?? ''), entrega: m.dt_entrega || proximoDiaUtil(data), salvo: true }
    setValores(v)
  }
  useEffect(() => { carregar() }, [data])

  const set = (k, campo, val) => setValores(p => ({ ...p, [k]: { ...p[k], [campo]: val, salvo: false } }))

  const salvar = async (u, rota) => {
    const k = chave(u.user_id, rota)
    const meta = parseFloat(String(valores[k]?.meta).replace(',', '.'))
    if (isNaN(meta) || meta <= 0) { showToast('Informe uma meta válida', 'error'); return }
    if (!valores[k]?.entrega) { showToast('Informe a data de entrega', 'error'); return }
    setSalvando(k)
    const { error } = await supabase.from('daily_goals').upsert(
      { user_id: u.user_id, route: rota, date: data, goal_value: meta, dt_entrega: valores[k].entrega },
      { onConflict: 'user_id,route,date' })
    setSalvando('')
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    setValores(p => ({ ...p, [k]: { ...p[k], salvo: true } }))
    showToast(`Meta de ${u.name} (${rota}) salva!`)
  }

  // Com uma rota escolhida no topo, mostra só os vendedores dessa rota.
  const lista = rota ? vendedores.filter(u => u.rotas.includes(rota)).map(u => ({ ...u, rotas: [rota] })) : vendedores
  const chaves = lista.flatMap(u => u.rotas.map(r => chave(u.user_id, r)))
  const total = chaves.length
  const definidas = chaves.filter(k => valores[k]?.salvo).length

  return <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
    <div onClick={() => setAberto(!aberto)} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🎯 Definir metas e datas de entrega{rota ? ` · ${rota}` : ''}</div>
        <div style={{ fontSize: 12, color: definidas < total ? WARNING : SUCCESS, fontWeight: 600 }}>{definidas} de {total} definidas · toque para {aberto ? 'fechar' : 'abrir'}</div>
      </div>
      <span style={{ color: MUTED, fontSize: 18 }}>{aberto ? '▾' : '▸'}</span>
    </div>
    {aberto && <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: 'block', marginBottom: 4 }}>DIA DA VENDA</label>
      <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 12 }} />
      {lista.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>{rota ? `Nenhum vendedor com a rota ${rota} no cadastro.` : 'Nenhum vendedor com rotas cadastradas.'} Vincule rotas em Config → Usuários.</div>}
      {lista.map(u => <div key={u.user_id} style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{u.name}{!u.egestor_vendedor_code && <span style={{ color: WARNING, fontWeight: 600, fontSize: 11 }}> · sem vendedor do eGestor vinculado</span>}</div>
        {u.rotas.map(rota => {
          const k = chave(u.user_id, rota), v = valores[k] || {}
          return <div key={rota} style={{ background: SURFACE, border: `1px solid ${v.salvo ? SUCCESS + '55' : BORDER}`, borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>{rota} {v.salvo && <span style={{ color: SUCCESS }}>✓</span>}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" inputMode="decimal" placeholder="Meta R$" value={v.meta || ''} onChange={e => set(k, 'meta', e.target.value)}
                style={{ width: 0, flex: 1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
              <input type="date" value={v.entrega || ''} onChange={e => set(k, 'entrega', e.target.value)}
                style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
              <button onClick={() => salvar(u, rota)} disabled={salvando === k}
                style={{ background: v.salvo ? SURFACE : ACCENT, color: v.salvo ? SUCCESS : '#fff', border: v.salvo ? `1px solid ${SUCCESS}55` : 'none', borderRadius: 6, padding: '6px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {salvando === k ? '…' : v.salvo ? 'Salvo' : 'Salvar'}
              </button>
            </div>
          </div>
        })}
      </div>)}
    </div>}
  </div>
}
