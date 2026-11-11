// eXpande 3.0 — cadastro de usuários com checagem de login e permissão.
// Substitui a admin-api da 2.0 (que continua existindo para a 2.0, sem mudanças).
// Toda chamada precisa do token do usuário logado (Authorization: Bearer <access_token>).
// A própria função confere o login, então pode rodar com "Verify JWT" desligado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Perfil da 2.0 (user_config.perfil), mantido em sincronia enquanto a 2.0 existir.
const perfil20 = (nome: string) => {
  const n = (nome || '').toLowerCase()
  if (n === 'administrador') return 'admin'
  if (n === 'financeiro') return 'financeiro'
  if (n === 'entregador') return 'entregador'
  return 'vendedor'
}

type Quem = { id: string; sistema: boolean; perms: Set<string> }

async function quemChama(req: Request): Promise<Quem | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: u } = await admin
    .from('usuarios')
    .select('id, ativo, perfis(ativo, sistema, perfil_permissoes(permissao_chave))')
    .eq('id', data.user.id)
    .maybeSingle()
  // deno-lint-ignore no-explicit-any
  const p: any = u?.perfis
  if (!u?.ativo || !p?.ativo) return null
  const perms = new Set<string>((p.perfil_permissoes || []).map((x: { permissao_chave: string }) => x.permissao_chave))
  return { id: data.user.id, sistema: !!p.sistema, perms }
}
const pode = (q: Quem, chave: string) => q.sistema || q.perms.has(chave)

async function perfilPorId(id: string) {
  const { data } = await admin.from('perfis').select('id, nome, sistema, ativo').eq('id', id).maybeSingle()
  return data
}

async function sincronizar20(id: string, nome: string, perfilNome: string, cod: number | null, rotas: string[]) {
  await admin.from('user_config').upsert({
    user_id: id,
    name: nome,
    perfil: perfil20(perfilNome),
    egestor_vendedor_code: cod,
    rotas
  }, { onConflict: 'user_id' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const quem = await quemChama(req)
  if (!quem) return json({ error: 'Faça login novamente.' }, 401)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* corpo vazio */ }
  const action = String(body.action || '')

  try {
    // ---------- LISTAR ----------
    if (action === 'listar') {
      if (!pode(quem, 'usuarios.ver')) return json({ error: 'Sem permissão para ver usuários.' }, 403)
      const { data: lista, error } = await admin
        .from('usuarios')
        .select('id, nome, email, perfil_id, egestor_vendedor_cod, rotas, ativo, criado_em, perfis(nome, sistema)')
        .order('nome')
      if (error) throw error
      const { data: auth } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const ultimo = new Map((auth?.users || []).map(u => [u.id, u.last_sign_in_at]))
      return json((lista || []).map(u => ({ ...u, ultimo_acesso: ultimo.get(u.id) || null })))
    }

    if (!pode(quem, 'usuarios.editar')) return json({ error: 'Sem permissão para alterar usuários.' }, 403)

    // ---------- CRIAR ----------
    if (action === 'criar') {
      const nome = String(body.nome || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const senha = String(body.senha || '')
      const perfilId = String(body.perfil_id || '')
      const cod = body.egestor_vendedor_cod ? Number(body.egestor_vendedor_cod) : null
      const rotas = Array.isArray(body.rotas) ? (body.rotas as string[]) : []
      if (!nome || !email || !perfilId) return json({ error: 'Preencha nome, e-mail e perfil.' }, 400)
      if (senha.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
      const perfil = await perfilPorId(perfilId)
      if (!perfil || !perfil.ativo) return json({ error: 'Perfil inválido.' }, 400)
      if (perfil.sistema && !quem.sistema) return json({ error: 'Só um Administrador pode criar outro Administrador.' }, 403)

      const { data: novo, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
      if (e1 || !novo?.user) return json({ error: e1?.message || 'Não foi possível criar o login.' }, 400)
      const id = novo.user.id
      const { error: e2 } = await admin.from('usuarios').insert({
        id, nome, email, perfil_id: perfilId, egestor_vendedor_cod: cod, rotas, ativo: true
      })
      if (e2) { await admin.auth.admin.deleteUser(id); throw e2 }
      await sincronizar20(id, nome, perfil.nome, cod, rotas)
      return json({ ok: true, id })
    }

    // ---------- ATUALIZAR ----------
    if (action === 'atualizar') {
      const id = String(body.id || '')
      const { data: atual } = await admin.from('usuarios').select('*, perfis(nome, sistema)').eq('id', id).maybeSingle()
      if (!atual) return json({ error: 'Usuário não encontrado.' }, 404)
      // deno-lint-ignore no-explicit-any
      const atualSistema = !!(atual as any).perfis?.sistema
      if (atualSistema && !quem.sistema) return json({ error: 'Só um Administrador pode alterar outro Administrador.' }, 403)

      const nome = body.nome !== undefined ? String(body.nome).trim() : atual.nome
      const perfilId = body.perfil_id !== undefined ? String(body.perfil_id) : atual.perfil_id
      const cod = body.egestor_vendedor_cod !== undefined ? (body.egestor_vendedor_cod ? Number(body.egestor_vendedor_cod) : null) : atual.egestor_vendedor_cod
      const rotas = Array.isArray(body.rotas) ? (body.rotas as string[]) : atual.rotas
      const ativo = body.ativo !== undefined ? !!body.ativo : atual.ativo

      if (id === quem.id && (perfilId !== atual.perfil_id || !ativo))
        return json({ error: 'Você não pode mudar o próprio perfil nem se desativar.' }, 400)
      const perfil = await perfilPorId(perfilId)
      if (!perfil || !perfil.ativo) return json({ error: 'Perfil inválido.' }, 400)
      if (perfil.sistema && !quem.sistema) return json({ error: 'Só um Administrador pode dar perfil de Administrador.' }, 403)
      if (!nome) return json({ error: 'O nome não pode ficar vazio.' }, 400)

      const { error } = await admin.from('usuarios').update({
        nome, perfil_id: perfilId, egestor_vendedor_cod: cod, rotas, ativo, atualizado_em: new Date().toISOString()
      }).eq('id', id)
      if (error) throw error
      if (ativo !== atual.ativo)
        await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : '876000h' })
      await sincronizar20(id, nome, perfil.nome, cod, rotas)
      return json({ ok: true })
    }

    // ---------- SENHA ----------
    if (action === 'senha') {
      const id = String(body.id || '')
      const senha = String(body.senha || '')
      if (senha.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
      const { data: alvo } = await admin.from('usuarios').select('perfis(sistema)').eq('id', id).maybeSingle()
      // deno-lint-ignore no-explicit-any
      if ((alvo as any)?.perfis?.sistema && !quem.sistema && id !== quem.id)
        return json({ error: 'Só um Administrador pode trocar a senha de outro Administrador.' }, 403)
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (err) {
    console.error('usuarios-api:', err)
    return json({ error: (err as Error)?.message || 'Erro inesperado.' }, 500)
  }
})
