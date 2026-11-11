// eXpande 3.0 — Usuários e Perfis (aba Config)
// Usuários: passam pela Edge Function usuarios-api (confere login e permissão).
// Perfis e permissões: gravados direto nas tabelas, protegidas por RLS (permissão usuarios.perfis).
import { useEffect, useMemo, useState } from 'react'

const ACCENT = '#2563EB', SUCCESS = '#16A34A', WARNING = '#D97706', DANGER = '#DC2626'
const SURFACE = '#F8FAFC', CARD = '#FFFFFF', BORDER = '#E2E8F0', MUTED = '#64748B'
const ROTAS = ['AFONSO CLAUDIO', 'BREJETUBA', 'DOMINGOS MARTINS', 'LARANJA DA TERRA', 'SANTA MARIA', 'SANTA TERESA', 'VENDA NOVA']

const card = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }
const input = { width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', marginBottom: 8, background: CARD }
const label = { fontSize: 11, fontWeight: 600, color: MUTED, display: 'block', marginBottom: 4 }
const btn = (bg, color = '#fff') => ({ background: bg, color, border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' })
const Badge = ({ color, children }) => <span style={{ background: color + '18', color, border: `1px solid ${color}33`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 4 }}>{children}</span>

function Rotas({ valor, onChange, disabled }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
    {ROTAS.map(r => {
      const tem = valor.includes(r)
      return <button key={r} type="button" disabled={disabled} onClick={() => onChange(tem ? valor.filter(x => x !== r) : [...valor, r])}
        style={{ border: `1px solid ${tem ? ACCENT : BORDER}`, background: tem ? ACCENT : CARD, color: tem ? '#fff' : MUTED, borderRadius: 16, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}>{r}</button>
    })}
  </div>
}

function FormUsuario({ inicial, perfis, vendedores, novo, onSalvar, onCancelar, salvando, proprio }) {
  const [f, setF] = useState(inicial)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  return <div>
    <label style={label}>NOME</label>
    <input style={input} value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
    {novo && <>
      <label style={label}>E-MAIL (LOGIN)</label>
      <input style={input} type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
      <label style={label}>SENHA INICIAL</label>
      <input style={input} type="password" value={f.senha} onChange={e => set('senha', e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
    </>}
    <label style={label}>PERFIL</label>
    <select style={input} value={f.perfil_id} disabled={proprio} onChange={e => set('perfil_id', e.target.value)}>
      <option value="">Selecione…</option>
      {perfis.filter(p => p.ativo || p.id === f.perfil_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
    <label style={label}>VENDEDOR NO EGESTOR</label>
    <select style={input} value={f.egestor_vendedor_cod || ''} onChange={e => set('egestor_vendedor_cod', e.target.value)}>
      <option value="">Nenhum</option>
      {vendedores.map(v => <option key={v.codigo} value={v.codigo}>{v.codigo} · {v.nome}</option>)}
    </select>
    <label style={label}>ROTAS</label>
    <Rotas valor={f.rotas || []} onChange={v => set('rotas', v)} />
    {!novo && !proprio && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
      <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} /> Usuário ativo (desmarcado = não consegue entrar)
    </label>}
    {proprio && <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Você não pode mudar o próprio perfil nem se desativar.</div>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button style={{ ...btn(SUCCESS), flex: 1 }} disabled={salvando} onClick={() => onSalvar(f)}>{salvando ? 'Salvando…' : novo ? 'Criar usuário' : 'Salvar'}</button>
      <button style={btn(SURFACE, MUTED)} onClick={onCancelar}>Cancelar</button>
    </div>
  </div>
}

function AbaUsuarios({ chamar, perfis, vendedores, pode, userId, showToast }) {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [editando, setEditando] = useState(null) // id | 'novo' | null
  const [salvando, setSalvando] = useState(false)
  const [senha, setSenha] = useState({})
  const [busca, setBusca] = useState('')
  const podeEditar = pode('usuarios.editar')

  const carregar = async () => {
    setCarregando(true)
    try { setLista(await chamar('listar')) } catch (e) { showToast(e.message, 'error') }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  const salvar = async (f, novo) => {
    setSalvando(true)
    try {
      await chamar(novo ? 'criar' : 'atualizar', { ...f, egestor_vendedor_cod: f.egestor_vendedor_cod || null })
      showToast(novo ? 'Usuário criado!' : 'Usuário atualizado!')
      setEditando(null)
      await carregar()
    } catch (e) { showToast(e.message, 'error') }
    setSalvando(false)
  }
  const trocarSenha = async (id) => {
    const s = senha[id] || ''
    if (s.length < 6) { showToast('A senha precisa ter pelo menos 6 caracteres', 'error'); return }
    try { await chamar('senha', { id, senha: s }); setSenha(p => ({ ...p, [id]: '' })); showToast('Senha alterada!') } catch (e) { showToast(e.message, 'error') }
  }

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return lista.filter(u => !b || `${u.nome} ${u.email} ${u.perfis?.nome}`.toLowerCase().includes(b))
  }, [lista, busca])
  const nomeVendedor = cod => vendedores.find(v => v.codigo === cod)?.nome

  return <div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input style={{ ...input, marginBottom: 0, flex: 1 }} placeholder="Buscar usuário…" value={busca} onChange={e => setBusca(e.target.value)} />
      <button style={btn(SURFACE, ACCENT)} onClick={carregar} disabled={carregando}>{carregando ? '⏳' : '🔄'}</button>
      {podeEditar && <button style={btn(ACCENT)} onClick={() => setEditando('novo')}>+ Novo</button>}
    </div>

    {editando === 'novo' && <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>➕ Novo usuário</div>
      <FormUsuario novo perfis={perfis} vendedores={vendedores} salvando={salvando}
        inicial={{ nome: '', email: '', senha: '', perfil_id: perfis.find(p => p.nome === 'Vendedor')?.id || '', egestor_vendedor_cod: '', rotas: [] }}
        onSalvar={f => salvar(f, true)} onCancelar={() => setEditando(null)} />
    </div>}

    {carregando && lista.length === 0 && <div style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: 20 }}>⏳ Carregando usuários…</div>}

    {filtrados.map(u => <div key={u.id} style={{ ...card, opacity: u.ativo ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome}{u.id === userId && <span style={{ color: MUTED, fontWeight: 500 }}> (você)</span>}</div>
          <div style={{ fontSize: 12, color: MUTED, wordBreak: 'break-all' }}>{u.email}</div>
          <div style={{ marginTop: 6 }}>
            <Badge color={u.perfis?.sistema ? DANGER : ACCENT}>{u.perfis?.nome || 'Sem perfil'}</Badge>
            {!u.ativo && <Badge color={WARNING}>Inativo</Badge>}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
            Vendedor: {u.egestor_vendedor_cod ? (nomeVendedor(u.egestor_vendedor_cod) || `código ${u.egestor_vendedor_cod}`) : '—'}
            {(u.rotas || []).length > 0 && <> · Rotas: {u.rotas.join(', ')}</>}
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>Último acesso: {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : 'nunca'}</div>
        </div>
        {podeEditar && editando !== u.id && <button style={btn(SURFACE, ACCENT)} onClick={() => setEditando(u.id)}>Editar</button>}
      </div>

      {editando === u.id && <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
        <FormUsuario perfis={perfis} vendedores={vendedores} salvando={salvando} proprio={u.id === userId}
          inicial={{ id: u.id, nome: u.nome, perfil_id: u.perfil_id, egestor_vendedor_cod: u.egestor_vendedor_cod || '', rotas: u.rotas || [], ativo: u.ativo }}
          onSalvar={f => salvar(f, false)} onCancelar={() => setEditando(null)} />
        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
          <label style={label}>NOVA SENHA</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...input, marginBottom: 0, flex: 1 }} type="password" autoComplete="new-password" placeholder="Mínimo 6 caracteres"
              value={senha[u.id] || ''} onChange={e => setSenha(p => ({ ...p, [u.id]: e.target.value }))} />
            <button style={btn(ACCENT)} onClick={() => trocarSenha(u.id)}>Alterar</button>
          </div>
        </div>
      </div>}
    </div>)}

    {!carregando && filtrados.length === 0 && <div style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: 20 }}>Nenhum usuário encontrado.</div>}
  </div>
}

function AbaPerfis({ supabase, perfis, recarregarPerfis, pode, showToast }) {
  const [permissoes, setPermissoes] = useState([])
  const [marcadas, setMarcadas] = useState({}) // perfil_id -> Set(chave)
  const [aberto, setAberto] = useState(null)
  const [novoNome, setNovoNome] = useState('')
  const [novaDesc, setNovaDesc] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const podeGerir = pode('usuarios.perfis')

  const carregar = async () => {
    const [{ data: pm, error: e1 }, { data: pp, error: e2 }] = await Promise.all([
      supabase.from('permissoes').select('*').order('ordem'),
      supabase.from('perfil_permissoes').select('perfil_id, permissao_chave')
    ])
    if (e1 || e2) { showToast('Erro ao carregar permissões', 'error'); return }
    setPermissoes(pm || [])
    const m = {}
    for (const r of pp || []) { (m[r.perfil_id] = m[r.perfil_id] || new Set()).add(r.permissao_chave) }
    setMarcadas(m)
  }
  useEffect(() => { carregar() }, [])

  const modulos = useMemo(() => {
    const g = []
    for (const p of permissoes) { let m = g.find(x => x.modulo === p.modulo); if (!m) g.push(m = { modulo: p.modulo, itens: [] }); m.itens.push(p) }
    return g
  }, [permissoes])

  const alternar = async (perfil, chave) => {
    if (!podeGerir || perfil.sistema) return
    const tem = marcadas[perfil.id]?.has(chave)
    setMarcadas(prev => { const s = new Set(prev[perfil.id] || []); tem ? s.delete(chave) : s.add(chave); return { ...prev, [perfil.id]: s } })
    const { error } = tem
      ? await supabase.from('perfil_permissoes').delete().eq('perfil_id', perfil.id).eq('permissao_chave', chave)
      : await supabase.from('perfil_permissoes').insert({ perfil_id: perfil.id, permissao_chave: chave })
    if (error) { showToast('Erro: ' + error.message, 'error'); carregar() }
  }

  const criarPerfil = async () => {
    if (!novoNome.trim()) { showToast('Dê um nome ao perfil', 'error'); return }
    setOcupado(true)
    const { data, error } = await supabase.from('perfis').insert({ nome: novoNome.trim(), descricao: novaDesc.trim() || null }).select('id').single()
    setOcupado(false)
    if (error) { showToast(error.code === '23505' ? 'Já existe um perfil com esse nome' : 'Erro: ' + error.message, 'error'); return }
    setNovoNome(''); setNovaDesc('')
    await recarregarPerfis()
    setAberto(data.id)
    showToast('Perfil criado! Agora marque as permissões.')
  }

  const salvarPerfil = async (perfil, campos) => {
    const { error } = await supabase.from('perfis').update(campos).eq('id', perfil.id)
    if (error) { showToast(error.code === '23505' ? 'Já existe um perfil com esse nome' : 'Erro: ' + error.message, 'error'); return }
    await recarregarPerfis()
    showToast('Perfil atualizado!')
  }

  return <div>
    {podeGerir && <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>➕ Novo perfil</div>
      <input style={input} placeholder="Nome (ex.: Gerente de produção)" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
      <input style={input} placeholder="Descrição (opcional)" value={novaDesc} onChange={e => setNovaDesc(e.target.value)} />
      <button style={{ ...btn(SUCCESS), width: '100%' }} disabled={ocupado} onClick={criarPerfil}>Criar perfil</button>
    </div>}

    {perfis.map(p => {
      const aberta = aberto === p.id
      const qtd = p.sistema ? permissoes.length : (marcadas[p.id]?.size || 0)
      return <div key={p.id} style={{ ...card, opacity: p.ativo ? 1 : 0.6 }}>
        <div onClick={() => setAberto(aberta ? null : p.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome} {p.sistema && <Badge color={DANGER}>Acesso total</Badge>}{!p.ativo && <Badge color={WARNING}>Inativo</Badge>}</div>
            {p.descricao && <div style={{ fontSize: 12, color: MUTED }}>{p.descricao}</div>}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{qtd} de {permissoes.length} permissões</div>
          </div>
          <span style={{ color: MUTED, fontSize: 18 }}>{aberta ? '▾' : '▸'}</span>
        </div>

        {aberta && <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12 }}>
          {p.sistema && <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>O Administrador tem todas as permissões e não pode ser alterado.</div>}
          {modulos.map(m => <div key={m.modulo} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>{m.modulo}</div>
            {m.itens.map(it => {
              const ok = p.sistema || !!marcadas[p.id]?.has(it.chave)
              return <label key={it.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, cursor: podeGerir && !p.sistema ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={ok} disabled={!podeGerir || p.sistema} onChange={() => alternar(p, it.chave)} style={{ width: 18, height: 18 }} />
                {it.descricao}
              </label>
            })}
          </div>)}
          {podeGerir && !p.sistema && <EditarPerfil perfil={p} onSalvar={campos => salvarPerfil(p, campos)} />}
        </div>}
      </div>
    })}
  </div>
}

function EditarPerfil({ perfil, onSalvar }) {
  const [nome, setNome] = useState(perfil.nome)
  const [desc, setDesc] = useState(perfil.descricao || '')
  return <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
    <label style={label}>NOME DO PERFIL</label>
    <input style={input} value={nome} onChange={e => setNome(e.target.value)} />
    <label style={label}>DESCRIÇÃO</label>
    <input style={input} value={desc} onChange={e => setDesc(e.target.value)} />
    <div style={{ display: 'flex', gap: 8 }}>
      <button style={{ ...btn(ACCENT), flex: 1 }} onClick={() => onSalvar({ nome: nome.trim(), descricao: desc.trim() || null })}>Salvar nome</button>
      <button style={btn(perfil.ativo ? '#FEF2F2' : '#F0FDF4', perfil.ativo ? DANGER : SUCCESS)} onClick={() => onSalvar({ ativo: !perfil.ativo })}>{perfil.ativo ? 'Desativar' : 'Reativar'}</button>
    </div>
  </div>
}

export default function GestaoUsuarios({ supabase, functionsUrl, pode, userId, showToast }) {
  const [aba, setAba] = useState('usuarios')
  const [perfis, setPerfis] = useState([])
  const [vendedores, setVendedores] = useState([])

  const chamar = async (action, dados = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${functionsUrl}/usuarios-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ action, ...dados })
    })
    let j = null
    try { j = await res.json() } catch { /* resposta vazia */ }
    if (!res.ok || j?.error) throw new Error(j?.error || `Erro ${res.status}`)
    return j
  }

  const recarregarPerfis = async () => {
    const { data } = await supabase.from('perfis').select('id, nome, descricao, sistema, ativo').order('nome')
    setPerfis(data || [])
  }

  useEffect(() => {
    recarregarPerfis()
    fetch(`${functionsUrl}/egestor-api?action=vendedores`).then(r => r.json()).then(j => {
      const arr = Array.isArray(j) ? j : (j?.data || [])
      setVendedores(arr.filter(v => v && v.codigo).map(v => ({ codigo: v.codigo, nome: String(v.nome || '').trim() })).sort((a, b) => a.codigo - b.codigo))
    }).catch(() => {})
  }, [])

  const Aba = ({ id, children }) => <button onClick={() => setAba(id)} style={{ flex: 1, border: 'none', borderBottom: `3px solid ${aba === id ? ACCENT : 'transparent'}`, background: 'none', padding: '10px 0', fontWeight: 700, fontSize: 14, color: aba === id ? ACCENT : MUTED, cursor: 'pointer' }}>{children}</button>

  return <div>
    <div style={{ display: 'flex', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
      <Aba id="usuarios">👥 Usuários</Aba>
      <Aba id="perfis">🛡️ Perfis</Aba>
    </div>
    {aba === 'usuarios'
      ? <AbaUsuarios chamar={chamar} perfis={perfis} vendedores={vendedores} pode={pode} userId={userId} showToast={showToast} />
      : <AbaPerfis supabase={supabase} perfis={perfis} recarregarPerfis={recarregarPerfis} pode={pode} showToast={showToast} />}
  </div>
}
