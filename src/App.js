import{useState,useCallback,useMemo,useEffect}from 'react'
import*as XLSX from 'xlsx'
import{supabase}from './lib/supabase'
import logoBase64 from './lib/logoBase64'
import{useAuth}from './lib/useAuth'
import GestaoUsuarios from './pages/Usuarios'
import MetasDoDia from './pages/MetasDoDia'
const ACCENT='#2563EB',ACCENT_LIGHT='#EFF6FF',SUCCESS='#16A34A',WARNING='#D97706',DANGER='#DC2626',SURFACE='#F8FAFC',CARD='#FFFFFF',BORDER='#E2E8F0',TEXT='#0F172A',MUTED='#64748B'
const fmt=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const today=()=>new Date().toISOString().split('T')[0]
const timeNow=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
const getGpsLocation=()=>new Promise(resolve=>{
  if(!navigator.geolocation){console.log('Geolocalização não suportada');resolve(null);return}
  navigator.geolocation.getCurrentPosition(
    pos=>{console.log('GPS capturado:',pos.coords.latitude,pos.coords.longitude);resolve({lat:pos.coords.latitude,lng:pos.coords.longitude})},
    err=>{console.log('Erro GPS:',err.code,err.message);resolve(null)},
    {timeout:15000,maximumAge:0}
  )
})
// Endereços das Edge Functions vêm do projeto Supabase configurado (REACT_APP_SUPABASE_URL).
// Assim a 3.0 em testes nunca chama as funções do banco real.
const FUNCTIONS_URL=`${process.env.REACT_APP_SUPABASE_URL}/functions/v1`
const EGESTOR_API=`${FUNCTIONS_URL}/egestor-api`
const ADMIN_API=`${FUNCTIONS_URL}/admin-api`
const ADMIN_ID='7ad867ea-496c-412c-8acd-5cc7c21eca0e'
const Badge=({color,children})=><span style={{background:color+'18',color,border:`1px solid ${color}33`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:600}}>{children}</span>
const KpiCard=({label,value,sub,color=ACCENT})=><div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',flex:1,minWidth:130}}><div style={{fontSize:11,color:MUTED,fontWeight:600,marginBottom:4,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:22,fontWeight:800,color}}>{value}</div>{sub&&<div style={{fontSize:11,color:MUTED,marginTop:2}}>{sub}</div>}</div>
export default function App(){
const{user}=useAuth()
const[clients,setClients]=useState([])
const[sales,setSales]=useState([])
const[orders,setOrders]=useState([])
const[routes,setRoutes]=useState([])
const[selectedRoute,setSelectedRoute]=useState('')
const[dailyGoal,setDailyGoal]=useState('')
const[goalInput,setGoalInput]=useState('')
const[dtEntrega,setDtEntrega]=useState('')
const[dtEntregaInput,setDtEntregaInput]=useState('')
const[selectedClient,setSelectedClient]=useState('')
const[saleValue,setSaleValue]=useState('')
const[saleNote,setSaleNote]=useState('')
const[activeTab,setActiveTab]=useState('dashboard')
const[toast,setToast]=useState(null)
const[dragOver,setDragOver]=useState(false)
const[clientSearch,setClientSearch]=useState('')
const[adminDate,setAdminDate]=useState(today())
const[adminSales,setAdminSales]=useState([])
const[adminOrders,setAdminOrders]=useState([])
const[adminVendorNames,setAdminVendorNames]=useState({})
const[adminLoading,setAdminLoading]=useState(false)
const[adminVisitasSemVenda,setAdminVisitasSemVenda]=useState([])
const[adminSalesItems,setAdminSalesItems]=useState({})
const[allRoutesSummary,setAllRoutesSummary]=useState([])
const[vendorRanking,setVendorRanking]=useState([])
const[allRoutesLoading,setAllRoutesLoading]=useState(false)
const[adminGoalValue,setAdminGoalValue]=useState('')
const[adminDtEntregaValue,setAdminDtEntregaValue]=useState('')
const[userPerfil,setUserPerfil]=useState('')
// eXpande 3.0 — permissões vêm do perfil do usuário (tabelas usuarios/perfis/perfil_permissoes).
// Se o usuário ainda não tem cadastro na 3.0 (perms===null), vale a regra antiga da 2.0.
const[perms,setPerms]=useState(null)
const[perfil3,setPerfil3]=useState('')
const[permsCarregadas,setPermsCarregadas]=useState(false)
useEffect(()=>{if(!user?.id)return;let ativo=true;(async()=>{try{
  const{data:u}=await supabase.from('usuarios').select('ativo,perfis(nome)').eq('id',user.id).maybeSingle()
  if(u&&u.ativo){const{data:pl}=await supabase.rpc('minhas_permissoes');const lista=(pl||[]).map(x=>typeof x==='string'?x:(x?.minhas_permissoes??Object.values(x||{})[0]));if(ativo){setPerms(new Set(lista));setPerfil3(u.perfis?.nome||'')}}
  else if(ativo){setPerms(null);setPerfil3('')}
}catch(e){console.log('Permissões 3.0 indisponíveis, usando regra da 2.0',e)}finally{if(ativo)setPermsCarregadas(true)}})();return()=>{ativo=false}},[user?.id])
const usa3=perms!==null
const pode=k=>usa3&&perms.has(k)
const isAdmin=usa3?pode('usuarios.editar'):user?.id===ADMIN_ID
const isPrivileged=usa3?pode('vendas.ver_todas'):(isAdmin||userPerfil==='financeiro')
const ehEntregador=usa3?perfil3==='Entregador':userPerfil==='entregador'
// Sem a permissão vendas.metas, a meta e a data de entrega do dia vêm do escritório (daily_goals).
const podeMetas=usa3?pode('vendas.metas'):true
useEffect(()=>{if(ehEntregador&&activeTab==='dashboard'){setActiveTab('clientes')}},[ehEntregador])
const[ordemEdit,setOrdemEdit]=useState({})
const[ordemSaving,setOrdemSaving]=useState(false)
const[tabSaleClient,setTabSaleClient]=useState(null)
const[tabSaleClientInput,setTabSaleClientInput]=useState('')
const[tabSaleValue,setTabSaleValue]=useState('')
const[tabSaleNote,setTabSaleNote]=useState('')
const[showSuggestions,setShowSuggestions]=useState(false)
const[showPaste,setShowPaste]=useState(false)
const[pasteText,setPasteText]=useState('')
const[loading,setLoading]=useState(false)
const[pedidoCliente,setPedidoCliente]=useState(null)
const[pedidoClienteSearch,setPedidoClienteSearch]=useState('')
const[pedidoPdf,setPedidoPdf]=useState(null)
const[modalProdutos,setModalProdutos]=useState(false)
const[modalProdutosEdicao,setModalProdutosEdicao]=useState(false)
const[modalProdutoSearch,setModalProdutoSearch]=useState('')
const[todosProdutos,setTodosProdutos]=useState([])
const[pedidoProdutos,setPedidoProdutos]=useState([])
const[pedidoSearch,setPedidoSearch]=useState('')
const[pedidoResultados,setPedidoResultados]=useState([])
const[pedidoFormaPgto,setPedidoFormaPgto]=useState('1')
const[pedidoVencimento,setPedidoVencimento]=useState(today())
const[pedidoSituacao,setPedidoSituacao]=useState('Pedido S/ NFe')
useEffect(()=>{
  if(pedidoSituacao==='Pedido S/ NFe')setPedidoFormaPgto('1')
  else if(pedidoSituacao==='Pedido C/ NFe')setPedidoFormaPgto('16')
  else setPedidoFormaPgto('')
},[pedidoSituacao])
const[pedidoLoading,setPedidoLoading]=useState(false)
const[clientePerfil,setClientePerfil]=useState(null)
const[perfilData,setPerfilData]=useState(null)
const[perfilLoading,setPerfilLoading]=useState(false)
const[modalNaoComprou,setModalNaoComprou]=useState(false)
const[motivoNaoComprou,setMotivoNaoComprou]=useState('')
const[obsNaoComprou,setObsNaoComprou]=useState('')
const[salvandoNaoComprou,setSalvandoNaoComprou]=useState(false)
const[configUsuarios,setConfigUsuarios]=useState([])
const[configVendedores,setConfigVendedores]=useState([])
const[novoEmail,setNovoEmail]=useState('')
const[novaSenha,setNovaSenha]=useState('')
const[novoNome,setNovoNome]=useState('')
const[novoEgestorCode,setNovoEgestorCode]=useState('')
const[novoPerfil,setNovoPerfil]=useState('vendedor')
const[novoPerfilCustom,setNovoPerfilCustom]=useState('')
const[configLoading,setConfigLoading]=useState(false)
const[senhaUser,setSenhaUser]=useState({})
const[produtoModal,setProdutoModal]=useState(null)
const[produtoModalQuant,setProdutoModalQuant]=useState(1)
const[produtoModalDesc,setProdutoModalDesc]=useState(0)
const[exportLoading,setExportLoading]=useState(false)
const[gpsStatus,setGpsStatus]=useState('checking')
const exportingRef=useState(()=>({current:false}))[0]
const[editandoOrder,setEditandoOrder]=useState(null)
const[editOrderProdutos,setEditOrderProdutos]=useState([])
const[editOrderSearch,setEditOrderSearch]=useState('')
const[editOrderResultados,setEditOrderResultados]=useState([])
const[editOrderFormaPgto,setEditOrderFormaPgto]=useState('')
const[editOrderSituacao,setEditOrderSituacao]=useState('Pedido S/ NFe')
const[relatorioRoute,setRelatorioRoute]=useState('')
const[relatorioInicio,setRelatorioInicio]=useState('')
const[relatorioFim,setRelatorioFim]=useState('')
const[relatorioLoading,setRelatorioLoading]=useState(false)
const[relatorioClientes,setRelatorioClientes]=useState([])
const[relatorioMeses,setRelatorioMeses]=useState([])
const[relatorioIncluirInativos,setRelatorioIncluirInativos]=useState(false)
const[relatorioTipo,setRelatorioTipo]=useState('compras')
const[relatorioVendedorFiltro,setRelatorioVendedorFiltro]=useState('')
const[trocaRoute,setTrocaRoute]=useState('')
const[trocaInicio,setTrocaInicio]=useState('')
const[trocaFim,setTrocaFim]=useState('')
const[trocaProdutoFiltro,setTrocaProdutoFiltro]=useState('')
const[trocaClienteFiltro,setTrocaClienteFiltro]=useState('')
const[trocaAgrupamento,setTrocaAgrupamento]=useState('produto')
const[trocaLoading,setTrocaLoading]=useState(false)
const[trocaResultado,setTrocaResultado]=useState([])
const[trocaVendedorFiltro,setTrocaVendedorFiltro]=useState('')
const[trocaVendedoresList,setTrocaVendedoresList]=useState([])
const[trocaSoProprio,setTrocaSoProprio]=useState(false)
const[ticketRoute,setTicketRoute]=useState('')
const[ticketInicio,setTicketInicio]=useState('')
const[ticketFim,setTicketFim]=useState('')
const[ticketVendedorFiltro,setTicketVendedorFiltro]=useState('')
const[ticketClienteFiltro,setTicketClienteFiltro]=useState('')
const[ticketSoProprio,setTicketSoProprio]=useState(false)
const[ticketLoading,setTicketLoading]=useState(false)
const[ticketResultado,setTicketResultado]=useState(null)
const[syncInicio,setSyncInicio]=useState('')
const[syncFim,setSyncFim]=useState('')
const[syncLoading,setSyncLoading]=useState(false)
const[editandoVenda,setEditandoVenda]=useState(null)
const[editVendaProdutos,setEditVendaProdutos]=useState([])
const[editVendaFormaPgto,setEditVendaFormaPgto]=useState('1')
const[editVendaSituacao,setEditVendaSituacao]=useState('Pedido S/ NFe')
const[editVendaLoading,setEditVendaLoading]=useState(false)
const[modalProdutosVenda,setModalProdutosVenda]=useState(false)
const showToast=(msg,type='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3200)}
const checkGpsPermission=()=>{
  if(!navigator.geolocation){setGpsStatus('denied');return}
  setGpsStatus('checking')
  navigator.geolocation.getCurrentPosition(
    ()=>setGpsStatus('granted'),
    ()=>setGpsStatus('denied'),
    {timeout:8000,maximumAge:0}
  )
}
const loadClients=useCallback(async()=>{if(!user?.id)return;const{data:userCfg}=await supabase.from('user_config').select('rotas,perfil').eq('user_id',user.id).single();setUserPerfil(userCfg?.perfil||'');const rotasUser=userCfg?.rotas||[];const query=supabase.from('clients').select('*').order('route').order('ordem');const{data,error}=rotasUser.length>0?await query.overlaps('rotas',rotasUser):await query;if(error){showToast('Erro ao carregar clientes.','error');return}setClients(data||[]);setRoutes([...new Set((data||[]).map(c=>c.route))].sort())},[user?.id])
const loadSales=useCallback(async()=>{if(!user?.id)return;const{data,error}=await supabase.from('sales').select('*').eq('user_id',user.id).eq('date',today()).order('created_at');if(error){showToast('Erro ao carregar vendas.','error');return}setSales(data)},[user?.id])
const loadOrders=useCallback(async()=>{if(!user?.id)return;const{data,error}=await supabase.from('orders').select('*').eq('user_id',user.id).eq('status','pendente').eq('date',today()).order('created_at');if(error){showToast('Erro ao carregar pedidos.','error');return}setOrders(data||[])},[user?.id])
const loadGoal=useCallback(async(route)=>{if(!route||!user?.id)return;const{data}=await supabase.from('daily_goals').select('goal_value,dt_entrega').eq('user_id',user.id).eq('route',route).eq('date',today()).single();setDailyGoal(data?.goal_value||'');setDtEntrega(data?.dt_entrega||'')},[user?.id])
const loadAdminRouteData=useCallback(async(route,date)=>{
  if(!route||!isPrivileged)return
  setAdminLoading(true)
  const{data:salesData}=await supabase.from('sales').select('*').eq('route',route).eq('date',date).order('created_at')
  const{data:ordersData}=await supabase.from('orders').select('*').eq('route',route).eq('date',date).order('created_at')
   const{data:visitasData}=await supabase.from('visitas_sem_venda').select('*').eq('route',route).eq('date',date).order('created_at')
setAdminVisitasSemVenda(visitasData||[])
  setAdminSales(salesData||[])
  setAdminOrders(ordersData||[])
  const saleIdsForItems=(salesData||[]).map(s=>s.id)
  if(saleIdsForItems.length>0){
    const{data:itemsData}=await supabase.from('sales_items').select('*').in('sale_id',saleIdsForItems)
    const itemsMap={}
    ;(itemsData||[]).forEach(item=>{
      if(!itemsMap[item.sale_id])itemsMap[item.sale_id]=[]
      itemsMap[item.sale_id].push(item)
    })
    setAdminSalesItems(itemsMap)
  }else{
    setAdminSalesItems({})
  }
  const userIds=[...new Set([...(salesData||[]).map(s=>s.user_id),...(ordersData||[]).map(o=>o.user_id)].filter(Boolean))]
  if(userIds.length>0){
    const{data:usersData}=await supabase.from('user_config').select('user_id,name').in('user_id',userIds)
    const namesMap={}
    ;(usersData||[]).forEach(u=>{namesMap[u.user_id]=u.name})
    setAdminVendorNames(namesMap)
  }else{
    setAdminVendorNames({})
  }
  const{data:goalData}=await supabase.from('daily_goals').select('goal_value,dt_entrega').eq('route',route).eq('date',date).limit(1).maybeSingle()
  setAdminGoalValue(goalData?.goal_value||'')
  setAdminDtEntregaValue(goalData?.dt_entrega||'')
  setAdminLoading(false)
},[isPrivileged])
const loadAllRoutesOverview=useCallback(async(date)=>{
  if(!isPrivileged)return
  setAllRoutesLoading(true)
  const{data:salesData}=await supabase.from('sales').select('route,user_id,value,note').eq('date',date)
  const valid=(salesData||[]).filter(s=>!['Bonificação','Troca'].includes(s.note))
  const routeMap={}
  valid.forEach(s=>{
    const r=s.route||'Sem rota'
    if(!routeMap[r])routeMap[r]={route:r,total:0,count:0}
    routeMap[r].total+=s.value
    routeMap[r].count++
  })
  const routeSummary=Object.values(routeMap).sort((a,b)=>b.total-a.total)
  const vendorMap={}
  valid.forEach(s=>{
    if(!s.user_id)return
    if(!vendorMap[s.user_id])vendorMap[s.user_id]={user_id:s.user_id,total:0,count:0}
    vendorMap[s.user_id].total+=s.value
    vendorMap[s.user_id].count++
  })
  const vendorIds=Object.keys(vendorMap)
  let namesMap={}
  if(vendorIds.length>0){
    const{data:usersData}=await supabase.from('user_config').select('user_id,name').in('user_id',vendorIds)
    ;(usersData||[]).forEach(u=>{namesMap[u.user_id]=u.name})
  }
  const vendorRankingArr=Object.values(vendorMap).map(v=>({...v,name:namesMap[v.user_id]||'Desconhecido'})).sort((a,b)=>b.total-a.total)
  setAllRoutesSummary(routeSummary)
  setVendorRanking(vendorRankingArr)
  setAllRoutesLoading(false)
},[isPrivileged])
useEffect(()=>{if(user?.id){loadClients();loadSales();loadOrders()}},[loadClients,loadSales,loadOrders,user?.id])
useEffect(()=>{if(user?.id){checkGpsPermission()}},[user?.id])
useEffect(()=>{
  if(!user?.id)return
  const ultimaSync=localStorage.getItem('lastSalesSync')
  const agora=Date.now()
  if(ultimaSync&&(agora-parseInt(ultimaSync))<24*60*60*1000)return
  const dataFim=today()
  const dataInicio=new Date(Date.now()-3*86400000).toISOString().split('T')[0]
  sincronizarVendas(dataInicio,dataFim).then(()=>{
    localStorage.setItem('lastSalesSync',String(agora))
  })
},[user?.id])
useEffect(()=>{if(isAdmin&&activeTab==='relatorio'&&trocaVendedoresList.length===0){carregarTrocaVendedores()}},[isAdmin,activeTab])
useEffect(()=>{loadGoal(selectedRoute)},[selectedRoute,loadGoal])
useEffect(()=>{if(!isPrivileged&&routes.length===1&&!selectedRoute){setSelectedRoute(routes[0])}},[isPrivileged,routes,selectedRoute])
useEffect(()=>{
  if(isPrivileged&&selectedRoute){
    loadAdminRouteData(selectedRoute,adminDate)
  }
},[isPrivileged,selectedRoute,adminDate,loadAdminRouteData])
useEffect(()=>{
  if(isPrivileged){
    loadAllRoutesOverview(adminDate)
  }
},[isPrivileged,adminDate,loadAllRoutesOverview])
const importClients=useCallback(async(rows)=>{if(!user?.id)return;setLoading(true);await supabase.from('clients').delete().eq('empresa_id','mageski');const toInsert=rows.map(cols=>({empresa_id:'mageski',name:String(cols[0]).trim(),route:String(cols[1]).trim(),inactive:cols[2]&&String(cols[2]).trim().toLowerCase()==='inativo'}));const{error}=await supabase.from('clients').insert(toInsert);if(error){showToast('Erro ao salvar clientes.','error');setLoading(false);return}await loadClients();setSales([]);setSelectedRoute('');setDailyGoal('');setLoading(false);showToast(`${toInsert.length} clientes importados!`)},[user?.id,loadClients])
const handleFile=useCallback((file)=>{if(!file)return;const reader=new FileReader();reader.onload=async(e)=>{try{const wb=XLSX.read(e.target.result,{type:'binary'});const ws=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(ws,{header:1});await importClients(data.slice(1).filter(r=>r[0]&&r[1]))}catch{showToast('Erro ao ler planilha.','error')}};reader.readAsBinaryString(file)},[importClients])
const handlePaste=useCallback(async()=>{try{const lines=pasteText.trim().split('\n').filter(Boolean);if(lines.length<2){showToast('Cole ao menos uma linha além do cabeçalho.','error');return}const dataLines=lines[0].toLowerCase().includes('cliente')?lines.slice(1):lines;const rows=dataLines.map(l=>l.split('\t')).filter(c=>c[0]?.trim()&&c[1]?.trim());if(rows.length===0){showToast('Nenhum dado válido.','error');return}await importClients(rows);setShowPaste(false);setPasteText('')}catch{showToast('Erro ao processar dados.','error')}},[pasteText,importClients])
const handleSetDtEntrega=async(data)=>{
  if(!data){showToast('Informe uma data válida.','error');return}
  if(user?.id&&selectedRoute){
    await supabase.from('daily_goals').upsert({user_id:user.id,route:selectedRoute,date:today(),dt_entrega:data},{onConflict:'user_id,route,date'})
  }
  setDtEntrega(data)
  setDtEntregaInput('')
  showToast(`Data de entrega: ${new Date(data+'T12:00:00').toLocaleDateString('pt-BR')}`)
}
const handleSetGoal=async(dtEntregaParam)=>{if(!user?.id)return;const v=parseFloat(goalInput);if(isNaN(v)||v<=0){showToast('Informe uma meta válida.','error');return}const payload={user_id:user.id,route:selectedRoute,goal_value:v,date:today()};if(dtEntregaParam){payload.dt_entrega=dtEntregaParam}const{error}=await supabase.from('daily_goals').upsert(payload,{onConflict:'user_id,route,date'});if(error){showToast('Erro ao salvar meta.','error');return}setDailyGoal(v);setGoalInput('')}
const handleAddSale=async()=>{if(!user?.id||!selectedClient||!saleValue||isNaN(parseFloat(saleValue))){showToast('Selecione um cliente e informe o valor.','error');return}const client=clients.find(c=>c.id===selectedClient);const gps=await getGpsLocation();const{data,error}=await supabase.from('sales').insert({user_id:user.id,client_id:client.id,client_name:client.name,route:client.route,value:parseFloat(saleValue),note:saleNote,sale_time:timeNow(),date:today(),gps_lat:gps?.lat||null,gps_lng:gps?.lng||null}).select().single();if(error){showToast('Erro ao registrar venda.','error');return}setSales(prev=>[...prev,data]);setSelectedClient('');setSaleValue('');setSaleNote('');showToast(`Venda de ${fmt(parseFloat(saleValue))} registrada!`)}
const handleAddTabSale=async()=>{if(!user?.id||!tabSaleClientInput.trim()||!tabSaleValue||isNaN(parseFloat(tabSaleValue))){showToast('Informe o cliente e o valor.','error');return}const value=parseFloat(tabSaleValue);const matched=tabSaleClient?.name===tabSaleClientInput?tabSaleClient:null;const gps=await getGpsLocation();const{data,error}=await supabase.from('sales').insert({user_id:user.id,client_id:matched?.id||null,client_name:tabSaleClientInput.trim(),route:matched?.route||selectedRoute||'—',value,note:tabSaleNote,sale_time:timeNow(),date:today(),gps_lat:gps?.lat||null,gps_lng:gps?.lng||null}).select().single();if(error){showToast('Erro ao registrar venda.','error');return}setSales(prev=>[...prev,data]);setTabSaleClient(null);setTabSaleClientInput('');setTabSaleValue('');setTabSaleNote('');showToast(`Venda de ${fmt(value)} registrada!`)}
const handleRemoveSale=async(id)=>{const{error}=await supabase.from('sales').delete().eq('id',id);if(error){showToast('Erro ao remover venda.','error');return}setSales(prev=>prev.filter(s=>s.id!==id))}
const salvarOrdem=async(rota)=>{
  setOrdemSaving(true)
  const rotaClients=clients.filter(c=>c.route===rota)
  const numeros=Object.entries(ordemEdit).filter(([id])=>rotaClients.find(c=>c.id===id)).map(([id,num])=>({id,num:parseInt(num)}))
  
  // Verificar duplicatas
  const nums=numeros.map(n=>n.num)
  const duplicatas=nums.filter((n,i)=>nums.indexOf(n)!==i)
  if(duplicatas.length>0){
    showToast(`Número ${duplicatas[0]} duplicado! Corrija antes de salvar.`,'error')
    setOrdemSaving(false)
    return
  }
  
  // Salvar cada alteração
  for(const{id,num}of numeros){
    await supabase.from('clients').update({ordem:num}).eq('id',id)
  }
  
  await loadClients()
  setOrdemEdit({})
  showToast('Ordem salva!')
  setOrdemSaving(false)
}
const moverCliente=async(clienteId,direcao,rota)=>{const rotaClients=clients.filter(c=>c.route===rota).sort((a,b)=>a.ordem-b.ordem);const idx=rotaClients.findIndex(c=>c.id===clienteId);if(direcao==='up'&&idx===0)return;if(direcao==='down'&&idx===rotaClients.length-1)return;const outro=direcao==='up'?rotaClients[idx-1]:rotaClients[idx+1];const atual=rotaClients[idx];await supabase.from('clients').update({ordem:outro.ordem}).eq('id',atual.id);await supabase.from('clients').update({ordem:atual.ordem}).eq('id',outro.id);await loadClients()}
const gerarPdf=async(order)=>{
  const nomeArquivo=`Pedido_${order.client_name.replace(/[^a-zA-Z0-9]/g,'_')}_${order.date}.pdf`
  const conteudo=`<html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b}.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:2px solid #d97706;padding-bottom:12px}.logo{height:60px}.empresa{text-align:right;font-size:11px;color:#64748b;line-height:1.6}.titulo{font-size:18px;font-weight:bold;margin:16px 0 4px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;background:#f8fafc;padding:12px;border-radius:8px}.info-item{font-size:12px}.info-label{font-weight:bold;color:#64748b;font-size:10px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#1e293b;color:#fff;padding:8px 10px;font-size:11px;text-align:left}td{padding:8px 10px;font-size:12px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background:#f8fafc}.total{text-align:right;font-size:16px;font-weight:bold;color:#2563eb;margin-top:8px}.footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:10px;color:#94a3b8;text-align:center}</style></head><body><div class="header"><img src="${logoBase64}" class="logo"/><div class="empresa">CNPJ: 18.520.142/0001-45<br/>Rua Anália Vieira de Souza, nº 38<br/>Bairro São Vicente - Afonso Cláudio ES<br/>Tel: 27 99852-2632</div></div><div class="titulo">Pedido de Venda</div><div class="info-grid"><div class="info-item"><div class="info-label">Cliente</div>${order.client_name}</div><div class="info-item"><div class="info-label">Data</div>${new Date(order.date+'T12:00:00').toLocaleDateString('pt-BR')}</div><div class="info-item"><div class="info-label">Situação</div>${order.situacao}</div><div class="info-item"><div class="info-label">Forma de Pagamento</div>${{1:'Dinheiro',2:'Cheque',8:'Pix/Ted',16:'Boleto Sicoob',17:'Débito em Conta'}[order.forma_pgto]||'-'}</div><div class="info-item"><div class="info-label">Vencimento</div>${order.vencimento?new Date(order.vencimento+'T12:00:00').toLocaleDateString('pt-BR'):'-'}</div><div class="info-item"><div class="info-label">Rota</div>${order.route||'-'}</div></div><table><thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Desc%</th><th>Total</th></tr></thead><tbody>${order.produtos.map(p=>`<tr><td>${p.descricao}</td><td>${p.quant}</td><td>${p.precoVenda.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td>${p.vDesc||0}%</td><td>${(p.precoVenda*p.quant*(1-(p.vDesc||0)/100)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></tr>`).join('')}</tbody></table><div class="total">Total: ${order.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div><div class="footer">Mageski Alimentos — 18.520.142/0001-45 — Rua Anália Vieira de Souza, nº 38, Bairro São Vicente, Afonso Cláudio ES — Tel: 27 99852-2632</div></body></html>`
  const blob=new Blob([conteudo],{type:'text/html'})
  const blobUrl=URL.createObjectURL(blob)
  if(navigator.share){
    try{
      const res=await fetch(blobUrl)
      const htmlBlob=await res.blob()
      const file=new File([htmlBlob],nomeArquivo.replace('.pdf','.html'),{type:'text/html'})
      await navigator.share({title:'Pedido de Venda',text:`Pedido - ${order.client_name}`,files:[file]})
    }catch(err){
      const janela=window.open(blobUrl,'_blank')
      if(janela){setTimeout(()=>janela.print(),800)}
    }
  }else{
    const janela=window.open('','_blank')
    if(janela){janela.document.title=nomeArquivo;janela.document.write(conteudo);janela.document.close();janela.focus();setTimeout(()=>janela.print(),800)}
  }
  URL.revokeObjectURL(blobUrl)
}
const abrirModalProdutosEdicao=async()=>{
  setModalProdutosEdicao(true)
  setModalProdutoSearch('')
  if(todosProdutos.length===0){
    try{
      const{data}=await supabase.from('products').select('*').gt('preco_venda',0).or('tags.cs.{"PROPRIO"},tags.cs.{"TERCEIROS"}').order('descricao')
      setTodosProdutos(data||[])
    }catch(err){showToast('Erro ao carregar produtos','error')}
  }
}
const abrirModalProdutosVenda=async()=>{
  setModalProdutosVenda(true)
  setModalProdutoSearch('')
  if(todosProdutos.length===0){
    try{
      const{data}=await supabase.from('products').select('*').gt('preco_venda',0).or('tags.cs.{"PROPRIO"},tags.cs.{"TERCEIROS"}').order('descricao')
      setTodosProdutos(data||[])
    }catch(err){showToast('Erro ao carregar produtos','error')}
  }
}
 const abrirModalProdutos=async()=>{
  setModalProdutos(true)
  setModalProdutoSearch('')
  if(todosProdutos.length===0){
    try{
      const{data}=await supabase.from('products').select('*').gt('preco_venda',0).or('tags.cs.{"PROPRIO"},tags.cs.{"TERCEIROS"}').order('descricao')
      setTodosProdutos(data||[])
    }catch(err){showToast('Erro ao carregar produtos','error')}
  }
}
const abrirPerfil=async(cliente)=>{setClientePerfil(cliente);setPerfilData(null);setPerfilLoading(true);try{const res=await fetch(`${EGESTOR_API}?action=perfil_cliente&codContato=${cliente.erp_code}`);const data=await res.json();setPerfilData(data)}catch(err){showToast('Erro ao buscar perfil','error')}setPerfilLoading(false)}
const salvarNaoComprou=async()=>{
  if(!motivoNaoComprou){showToast('Selecione um motivo.','error');return}
  setSalvandoNaoComprou(true)
  const gps=await getGpsLocation()
  const{error}=await supabase.from('visitas_sem_venda').insert({
    user_id:user.id,
    client_id:clientePerfil.id||null,
    client_name:clientePerfil.name,
    route:clientePerfil.route||selectedRoute||'',
    motivo:motivoNaoComprou,
    observacao:obsNaoComprou||null,
    date:today(),
    visit_time:timeNow(),
    gps_lat:gps?.lat||null,
    gps_lng:gps?.lng||null
  })
  setSalvandoNaoComprou(false)
  if(error){showToast('Erro ao registrar visita.','error');return}
  showToast('Visita registrada!')
  setModalNaoComprou(false)
  setMotivoNaoComprou('')
  setObsNaoComprou('')
  setClientePerfil(null)
}
const salvarPedido=async()=>{if(!pedidoCliente||pedidoProdutos.length===0){showToast('Preencha cliente e produtos.','error');return}if(['Pedido S/ NFe','Pedido C/ NFe'].includes(pedidoSituacao)&&!pedidoFormaPgto){showToast('Selecione a forma de pagamento.','error');return}setPedidoLoading(true);try{const total=pedidoProdutos.reduce((acc,p)=>{const sub=p.precoVenda*p.quant;const desc=sub*(p.vDesc||0)/100;return acc+sub-desc},0);const uid=user.id;const gps=await getGpsLocation();const{error}=await supabase.from('orders').insert({user_id:uid,client_id:pedidoCliente.id||null,client_name:pedidoCliente.name,client_erp_code:pedidoCliente.erp_code,route:selectedRoute||pedidoCliente.route||'',situacao:pedidoSituacao,forma_pgto:pedidoFormaPgto?parseInt(pedidoFormaPgto):null,vencimento:pedidoVencimento,produtos:pedidoProdutos,total,date:today(),gps_lat:gps?.lat||null,gps_lng:gps?.lng||null});if(error){showToast('Erro ao salvar pedido','error')}else{showToast('Pedido salvo!');setPedidoCliente(null);setPedidoProdutos([]);setPedidoFormaPgto('1');setPedidoSituacao('Pedido S/ NFe');setPedidoVencimento(today());await loadOrders()}}catch(err){showToast('Erro ao salvar pedido','error')}setPedidoLoading(false)}
const excluirPedido=async(id)=>{const{error}=await supabase.from('orders').delete().eq('id',id);if(error){showToast('Erro ao excluir pedido','error');return}setOrders(prev=>prev.filter(o=>o.id!==id));showToast('Pedido excluído')}
const exportarPedidos=async()=>{if(exportingRef.current){return}exportingRef.current=true;const pendentes=orders.filter(o=>o.status==='pendente');if(pendentes.length===0){showToast('Nenhum pedido pendente','error');exportingRef.current=false;return}setExportLoading(true);let ok=0;let erros=0;for(const order of pendentes){try{const res=await fetch(`${EGESTOR_API}?action=criar_venda`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codContato:order.client_erp_code,nomeContato:order.client_name,route:order.route,user_id:user.id,produtos:order.produtos.map(p=>({codigo:p.codigo,quant:p.quant,preco:p.precoVenda,vDesc:p.vDesc||0})),codFormaPgto:order.forma_pgto,vencimento:order.vencimento||today(),situacaoOS:order.situacao,dtEntrega:dtEntrega||new Date(Date.now()+86400000).toISOString().split('T')[0],gpsLat:order.gps_lat||null,gpsLng:order.gps_lng||null})});const result=await res.json();if(result.codigo){const{data:saleData}=await supabase.from('sales').select('id').eq('erp_code',result.codigo).single();if(saleData?.id){const items=order.produtos.map(p=>({sale_id:saleData.id,user_id:user.id,client_erp_code:order.client_erp_code,erp_code:p.codigo,descricao:p.descricao,codigo_proprio:p.codigoProprio||'',quant:p.quant,preco:p.precoVenda,vdesc:p.vDesc||0,total:p.precoVenda*p.quant*(1-(p.vDesc||0)/100),date:today()}));await supabase.from('sales_items').insert(items)}await supabase.from('orders').delete().eq('id',order.id);ok++}else{erros++}}catch(err){erros++}}await loadOrders();await loadSales();setExportLoading(false);exportingRef.current=false;if(erros===0){showToast(`${ok} pedido(s) exportado(s)!`)}else{showToast(`${ok} exportado(s), ${erros} com erro`,'error')}}
const abrirEdicaoOrder=async(order)=>{setEditandoOrder(order);setEditOrderProdutos(order.produtos||[]);setEditOrderFormaPgto(String(order.forma_pgto||'1'));setEditOrderSituacao(order.situacao||'Pedido S/ NFe')}
const salvarEdicaoOrder=async()=>{if(!editandoOrder||editOrderProdutos.length===0){showToast('Adicione ao menos um produto','error');return}const total=editOrderProdutos.reduce((acc,p)=>acc+p.precoVenda*p.quant*(1-(p.vDesc||0)/100),0);const{error}=await supabase.from('orders').update({produtos:editOrderProdutos,forma_pgto:parseInt(editOrderFormaPgto),situacao:editOrderSituacao,total}).eq('id',editandoOrder.id);if(error){showToast('Erro ao salvar','error');return}showToast('Pedido atualizado!');setEditandoOrder(null);await loadOrders()}
const gerarRelatorio=async()=>{
  if(!relatorioInicio||!relatorioFim){showToast('Selecione o período.','error');return}
  setRelatorioLoading(true)
  try{
let baseQuery=supabase.from('sales').select('*').gte('date',relatorioInicio).lte('date',relatorioFim).order('date')
    baseQuery=relatorioRoute?baseQuery.eq('route',relatorioRoute):baseQuery.in('route',routes)
    if(relatorioVendedorFiltro)baseQuery=baseQuery.eq('user_id',relatorioVendedorFiltro)
    let salesData=[]
    let pagina=0
    const TAMANHO_PAGINA=1000
    while(true){
      const{data:pageData,error}=await baseQuery.range(pagina*TAMANHO_PAGINA,(pagina+1)*TAMANHO_PAGINA-1)
      if(error){showToast('Erro ao carregar relatório: '+error.message,'error');setRelatorioLoading(false);return}
      salesData=salesData.concat(pageData||[])
      if(!pageData||pageData.length<TAMANHO_PAGINA)break
      pagina++
    }
    const routeClients=relatorioRoute?clients.filter(c=>(c.rotas||[c.route]).includes(relatorioRoute)&&(relatorioIncluirInativos||!c.inactive)):clients.filter(c=>relatorioIncluirInativos||!c.inactive)
    const meses=[]
    let d=new Date(relatorioInicio+'T12:00:00')
    const fimData=new Date(relatorioFim+'T12:00:00')
    while(d<=fimData){
      meses.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
      d.setMonth(d.getMonth()+1)
    }
    const mesesUnicos=[...new Set(meses)]
    const clientesData=routeClients.map(c=>{
      const totals={}
      mesesUnicos.forEach(m=>totals[m]=0)
      let total=0
      ;(salesData||[]).filter(s=>s.client_id===c.id&&!['Bonificação','Troca'].includes(s.note)).forEach(s=>{
        const mes=s.date.slice(0,7)
        if(totals[mes]!==undefined){totals[mes]+=s.value;total+=s.value}
      })
      return{id:c.id,name:c.name,inactive:c.inactive,totals,total}
    }).sort((a,b)=>b.total-a.total)
    setRelatorioMeses(mesesUnicos)
    setRelatorioClientes(clientesData)
  }catch(err){
    showToast('Erro inesperado ao gerar relatório.','error')
    console.error(err)
  }
  setRelatorioLoading(false)
}
const exportarRelatorioExcel=()=>{
  const header=['Cliente',...relatorioMeses,'Total']
  const rows=relatorioClientes.map(c=>[c.name,...relatorioMeses.map(m=>c.totals[m]||0),c.total])
  rows.push(['TOTAL',...relatorioMeses.map(m=>relatorioTotaisPorMes[m]),relatorioTotalGeral])
  const ws=XLSX.utils.aoa_to_sheet([header,...rows])
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,'Relatório')
  XLSX.writeFile(wb,`Relatorio_${relatorioRoute?relatorioRoute.replace(/\s/g,'_'):'todas_rotas'}_${relatorioInicio}_a_${relatorioFim}.xlsx`)
}
const buscarProdutos=async(search,setResultados)=>{if(search.length<2){setResultados([]);return}try{const res=await fetch(`${EGESTOR_API}?action=produtos&search=${encodeURIComponent(search)}`);const data=await res.json();const filtrado=(Array.isArray(data)?data:[]).filter(p=>p.descricao?.toLowerCase().includes(search.toLowerCase())||p.codigoProprio?.toLowerCase().includes(search.toLowerCase()));setResultados(filtrado)}catch(err){showToast('Erro ao buscar produtos','error')}}
const addProduto=(produto,setProdutos,setSearch,setResultados)=>{setProdutoModal({produto,setProdutos,setSearch,setResultados});setProdutoModalQuant(1);setProdutoModalDesc(0);setSearch('');setResultados([])}
const confirmarProdutoModal=()=>{if(!produtoModal)return;const{produto,setProdutos}=produtoModal;setProdutos(prev=>{const existe=prev.find(p=>p.codigo===produto.codigo);if(existe)return prev.map(p=>p.codigo===produto.codigo?{...p,quant:p.quant+produtoModalQuant,vDesc:produtoModalDesc}:p);return[...prev,{...produto,quant:produtoModalQuant,vDesc:produtoModalDesc}]});setProdutoModal(null)}
const carregarConfig=async()=>{setConfigLoading(true);try{const usersRes=await fetch(`${ADMIN_API}?action=listar_usuarios`);const users=await usersRes.json();setConfigUsuarios(Array.isArray(users)?users:[]);const fallbackVend=[{codigo:1,nome:'Vicon Soluções Empresariais'},{codigo:3,nome:'JULIANO RODRIGO MAGESKI'},{codigo:4,nome:'LUCAS DE PAULO OLIVEIRA'},{codigo:5,nome:'ELIESIMO ADRIANO PEREIRA'},{codigo:7,nome:'OTAVIO DOS SANTOS RIBEIRO'},{codigo:11,nome:'ADRIANO PEREIRA'}];let listaVend=[];try{const vr=await fetch(`${EGESTOR_API}?action=vendedores`);const vj=await vr.json();const arr=Array.isArray(vj)?vj:(vj?.data||[]);listaVend=arr.filter(v=>v&&v.codigo).map(v=>({codigo:v.codigo,nome:String(v.nome||'').trim()}))}catch(e){};const codsVend=new Set(listaVend.map(v=>v.codigo));setConfigVendedores([...listaVend,...fallbackVend.filter(v=>!codsVend.has(v.codigo))].sort((a,b)=>a.codigo-b.codigo))}catch(err){showToast('Erro ao carregar configurações','error')}setConfigLoading(false)}
const criarUsuario=async()=>{if(!novoEmail||!novaSenha||!novoNome||(novoPerfil!=='entregador'&&!novoEgestorCode)){showToast('Preencha todos os campos','error');return}const perfilFinal=novoPerfil==='outro'?novoPerfilCustom.trim():novoPerfil;if(novoPerfil==='outro'&&!perfilFinal){showToast('Informe o nome do perfil.','error');return}setConfigLoading(true);try{const res=await fetch(`${ADMIN_API}?action=criar_usuario`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:novoEmail,password:novaSenha,name:novoNome,egestor_code:novoEgestorCode?parseInt(novoEgestorCode):null,perfil:perfilFinal})});const data=await res.json();if(data.error){showToast('Erro: '+data.error,'error')}else{showToast('Usuário criado!');setNovoEmail('');setNovaSenha('');setNovoNome('');setNovoEgestorCode('');setNovoPerfil('vendedor');setNovoPerfilCustom('');await carregarConfig()}}catch(err){showToast('Erro ao criar usuário','error')}setConfigLoading(false)}
const deletarUsuario=async(user_id)=>{if(!window.confirm('Confirma exclusão do usuário?'))return;setConfigLoading(true);try{const res=await fetch(`${ADMIN_API}?action=deletar_usuario`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id})});const data=await res.json();if(data.error){showToast('Erro: '+data.error,'error')}else{showToast('Usuário excluído!');await carregarConfig()}}catch(err){showToast('Erro ao excluir','error')}setConfigLoading(false)}
const atualizarSenha=async(user_id)=>{const nova=senhaUser[user_id];if(!nova||nova.length<6){showToast('Senha deve ter ao menos 6 caracteres','error');return}setConfigLoading(true);try{const res=await fetch(`${ADMIN_API}?action=atualizar_senha`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id,password:nova})});const data=await res.json();if(data.error){showToast('Erro: '+data.error,'error')}else{showToast('Senha atualizada!');setSenhaUser(prev=>({...prev,[user_id]:''}))} }catch(err){showToast('Erro ao atualizar senha','error')}setConfigLoading(false)}
const totalPedido=pedidoProdutos.reduce((acc,p)=>acc+p.precoVenda*p.quant*(1-(p.vDesc||0)/100),0)
const routeClients=useMemo(()=>selectedRoute?clients.filter(c=>(c.rotas||[c.route]).includes(selectedRoute)):[],[clients,selectedRoute])
const routeSales=useMemo(()=>sales.filter(s=>s.route===selectedRoute),[sales,selectedRoute])
const routeOrders=useMemo(()=>orders.filter(o=>o.route===selectedRoute),[orders,selectedRoute])
const soldClientIds=useMemo(()=>new Set(routeSales.map(s=>s.client_id).filter(Boolean)),[routeSales])
const inactiveSoldClients=useMemo(()=>routeSales.filter(s=>clients.find(c=>c.id===s.client_id)?.inactive),[routeSales,clients])
const activeRouteClients=useMemo(()=>routeClients.filter(c=>!c.inactive),[routeClients])
const activeSoldIds=useMemo(()=>new Set(routeSales.filter(s=>{const c=clients.find(cl=>cl.id===s.client_id);return!c||!c.inactive}).map(s=>s.client_id).filter(Boolean)),[routeSales,clients])
const totalSold=useMemo(()=>routeSales.filter(s=>!['Bonificação','Troca'].includes(s.note)).reduce((a,s)=>a+s.value,0),[routeSales])
const remaining=activeRouteClients.length-activeSoldIds.size
const avgTicket=activeSoldIds.size>0?totalSold/activeSoldIds.size:0
const ticketMeta=dailyGoal&&activeRouteClients.length>0?dailyGoal/activeRouteClients.length:0
const ticketColor=ticketMeta===0?ACCENT:avgTicket>=ticketMeta?SUCCESS:avgTicket>=ticketMeta*0.8?WARNING:DANGER
const goalProgress=dailyGoal?Math.min((totalSold/dailyGoal)*100,100):0
const clientSuggestions=useMemo(()=>{const pool=selectedRoute?routeClients:clients;if(!tabSaleClientInput.trim())return pool.slice(0,6);return pool.filter(c=>c.name.toLowerCase().includes(tabSaleClientInput.toLowerCase())).slice(0,6)},[clients,routeClients,selectedRoute,tabSaleClientInput])
const filteredClients=useMemo(()=>(selectedRoute?routeClients:clients).filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())),[routeClients,clients,selectedRoute,clientSearch]) 
const relatorioTotaisPorMes=useMemo(()=>{
const totais={}
  relatorioMeses.forEach(m=>{totais[m]=relatorioClientes.reduce((a,c)=>a+(c.totals[m]||0),0)})
  return totais
},[relatorioClientes,relatorioMeses])
const relatorioTotalGeral=useMemo(()=>relatorioClientes.reduce((a,c)=>a+c.total,0),[relatorioClientes])
const trocaPercentualMedio=useMemo(()=>{
  if(trocaResultado.length===0)return 0
  const totalNormal=trocaResultado.reduce((a,r)=>a+r.qtdNormal,0)
  const totalTroca=trocaResultado.reduce((a,r)=>a+r.qtdTroca,0)
  return totalNormal>0?(totalTroca/totalNormal*100):0
},[trocaResultado])
const exportarTrocasExcel=()=>{
  const header=[trocaAgrupamento==='produto'?'Produto':'Cliente','Qtd Vendida','Qtd Trocada','% Troca']
  const rows=trocaResultado.map(r=>[r.nome,r.qtdNormal,r.qtdTroca,r.percentual.toFixed(1)+'%'])
  rows.push(['MÉDIA GERAL','','',trocaPercentualMedio.toFixed(1)+'%'])
  const ws=XLSX.utils.aoa_to_sheet([header,...rows])
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,'Trocas')
  XLSX.writeFile(wb,`Trocas_${trocaRoute||'todas_rotas'}_${trocaInicio}_a_${trocaFim}.xlsx`)
}
const gerarTicketMedio=async()=>{
  if(!ticketInicio||!ticketFim){showToast('Selecione período.','error');return}
  setTicketLoading(true)
  try{
    let salesQuery=supabase.from('sales').select('id,client_id,client_name,value,note,user_id,route').gte('date',ticketInicio).lte('date',ticketFim)
    salesQuery=ticketRoute?salesQuery.eq('route',ticketRoute):salesQuery.in('route',routes)
    if(ticketVendedorFiltro)salesQuery=salesQuery.eq('user_id',ticketVendedorFiltro)
    if(ticketClienteFiltro)salesQuery=salesQuery.ilike('client_name',`%${ticketClienteFiltro}%`)
    const{data:salesData,error:salesErr}=await salesQuery
    if(salesErr){showToast('Erro ao carregar vendas.','error');setTicketLoading(false);return}

    let visitasQuery=supabase.from('visitas_sem_venda').select('client_id,client_name,user_id,route').gte('date',ticketInicio).lte('date',ticketFim)
    visitasQuery=ticketRoute?visitasQuery.eq('route',ticketRoute):visitasQuery.in('route',routes)
    if(ticketVendedorFiltro)visitasQuery=visitasQuery.eq('user_id',ticketVendedorFiltro)
    if(ticketClienteFiltro)visitasQuery=visitasQuery.ilike('client_name',`%${ticketClienteFiltro}%`)
    const{data:visitasData}=await visitasQuery

    const clientesInativos=new Set(clients.filter(c=>c.inactive).map(c=>c.id))

   const vendasValidas=(salesData||[]).filter(s=>!['Bonificação','Troca'].includes(s.note)&&(!s.client_id||!clientesInativos.has(s.client_id)))
    const visitasValidas=(visitasData||[]).filter(v=>!v.client_id||!clientesInativos.has(v.client_id))
    const numPedidos=vendasValidas.length+visitasValidas.length
    let totalVendido=0
    if(ticketSoProprio){
      const saleIds=vendasValidas.map(s=>s.id)
      if(saleIds.length>0){
        const{data:produtosProprios}=await supabase.from('products').select('erp_code').filter('tags','cs','{"PROPRIO"}')
        const propriosSet=new Set((produtosProprios||[]).map(p=>String(p.erp_code)))
       let itemsData=[]
        const LOTE_ITEMS=200
        for(let i=0;i<saleIds.length;i+=LOTE_ITEMS){
          const loteIds=saleIds.slice(i,i+LOTE_ITEMS)
          let pagina=0
          while(true){
            const{data:loteItems}=await supabase.from('sales_items').select('sale_id,erp_code,total').in('sale_id',loteIds).range(pagina*1000,(pagina+1)*1000-1)
            itemsData=itemsData.concat(loteItems||[])
            if(!loteItems||loteItems.length<1000)break
            pagina++
          }
        }
        totalVendido=(itemsData||[]).filter(item=>propriosSet.has(String(item.erp_code))).reduce((a,item)=>a+item.total,0)
      }
    }else{
      totalVendido=vendasValidas.reduce((a,s)=>a+s.value,0)
    }

    const ticketMedio=numPedidos>0?totalVendido/numPedidos:0

    setTicketResultado({totalVendido,numClientes:numPedidos,ticketMedio})
  }catch(err){
    showToast('Erro inesperado ao gerar relatório.','error')
    console.error(err)
  }
  setTicketLoading(false)
}
const exportarTicketExcel=()=>{
  if(!ticketResultado)return
  const header=['Rota','Período','Total Vendido','Clientes Atendidos','Ticket Médio']
  const row=[ticketRoute||'Todas',`${ticketInicio} a ${ticketFim}`,ticketResultado.totalVendido,ticketResultado.numClientes,ticketResultado.ticketMedio.toFixed(2)]
  const ws=XLSX.utils.aoa_to_sheet([header,row])
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,'Ticket Medio')
  XLSX.writeFile(wb,`TicketMedio_${ticketRoute||'todas_rotas'}_${ticketInicio}_a_${ticketFim}.xlsx`)
}
const carregarTrocaVendedores=async()=>{
  const{data}=await supabase.from('user_config').select('user_id,name').order('name')
  setTrocaVendedoresList((data||[]).filter(v=>v.name))
}
const sincronizarVendas=async(dataInicio,dataFim)=>{
  const{data:vendasParaSincronizar}=await supabase.from('sales').select('id,erp_code,value').gte('date',dataInicio).lte('date',dataFim).not('erp_code','is',null)
  if(!vendasParaSincronizar||vendasParaSincronizar.length===0)return{atualizadas:0,total:0}
  let atualizadas=0
  for(const venda of vendasParaSincronizar){
    try{
      const res=await fetch(`${EGESTOR_API}?action=buscar_venda&codVenda=${venda.erp_code}`)
      const data=await res.json()
      console.log('Venda eGestor',venda.erp_code,':',JSON.stringify(data))
      const novoValor=data?.valorTotal??data?.total??data?.financeiros?.[0]?.valor??null
      if(novoValor!==null&&Math.abs(novoValor-venda.value)>0.01){
        await supabase.from('sales').update({value:novoValor}).eq('id',venda.id)
        atualizadas++
      }
    }catch(err){
      console.log('Erro ao sincronizar venda',venda.erp_code,err)
    }
  }
  return{atualizadas,total:vendasParaSincronizar.length}
}
const gerarRelatorioTrocas=async()=>{
  if(!trocaInicio||!trocaFim){showToast('Selecione período.','error');return}
  setTrocaLoading(true)
  try{
    let query=supabase.from('sales').select('id,note,client_name').gte('date',trocaInicio).lte('date',trocaFim)
    query=trocaRoute?query.eq('route',trocaRoute):query.in('route',routes)
    if(trocaVendedorFiltro)query=query.eq('user_id',trocaVendedorFiltro)
    const{data:salesData,error:salesErr}=await query
    if(salesErr){showToast('Erro ao carregar vendas.','error');setTrocaLoading(false);return}
    const salesIds=(salesData||[]).map(s=>s.id)
    if(salesIds.length===0){setTrocaResultado([]);setTrocaLoading(false);return}
    const salesById={}
    ;(salesData||[]).forEach(s=>{salesById[s.id]=s})
   const LOTE=200
    let itemsData=[]
    for(let i=0;i<salesIds.length;i+=LOTE){
      const loteIds=salesIds.slice(i,i+LOTE)
      const{data:loteItems,error:itemsErr}=await supabase.from('sales_items').select('*').in('sale_id',loteIds)
      if(itemsErr){showToast('Erro ao carregar itens.','error');setTrocaLoading(false);return}
      itemsData=itemsData.concat(loteItems||[])
    }
    let propriosSet=null
    if(trocaSoProprio){
      const{data:produtosProprios}=await supabase.from('products').select('erp_code').filter('tags','cs','{"PROPRIO"}')
      propriosSet=new Set((produtosProprios||[]).map(p=>String(p.erp_code)))
    }
    const grupos={}
   ;(itemsData||[]).forEach(item=>{
      const venda=salesById[item.sale_id]
      if(!venda)return
      if(venda.note==='Bonificação')return
      if(propriosSet&&!propriosSet.has(String(item.erp_code)))return
      if(trocaProdutoFiltro&&!item.descricao?.toLowerCase().includes(trocaProdutoFiltro.toLowerCase()))return
      if(trocaClienteFiltro&&!venda.client_name?.toLowerCase().includes(trocaClienteFiltro.toLowerCase()))return
      const chave=trocaAgrupamento==='produto'?item.descricao:venda.client_name
      if(!grupos[chave])grupos[chave]={nome:chave,qtdNormal:0,qtdTroca:0}
      if(venda.note==='Troca'){grupos[chave].qtdTroca+=item.quant}
      else{grupos[chave].qtdNormal+=item.quant}
    })
    const resultado=Object.values(grupos).map(g=>({
      ...g,
      percentual:g.qtdNormal>0?(g.qtdTroca/g.qtdNormal*100):(g.qtdTroca>0?100:0)
    })).sort((a,b)=>b.percentual-a.percentual)
    setTrocaResultado(resultado)
  }catch(err){
    showToast('Erro inesperado ao gerar relatório.','error')
    console.error(err)
  }
  setTrocaLoading(false)
}
const adminActiveRouteClients=useMemo(()=>selectedRoute?clients.filter(c=>(c.rotas||[c.route]).includes(selectedRoute)&&!c.inactive):[],[clients,selectedRoute])
const adminSoldClientIds=useMemo(()=>new Set(adminSales.map(s=>s.client_id).filter(Boolean)),[adminSales])
const adminTotalSold=useMemo(()=>adminSales.filter(s=>!['Bonificação','Troca'].includes(s.note)).reduce((a,s)=>a+s.value,0),[adminSales])
const adminTotalPendente=useMemo(()=>adminOrders.filter(o=>!['Bonificação','Troca'].includes(o.situacao)).reduce((a,o)=>a+o.total,0),[adminOrders])
const adminVendorsToday=useMemo(()=>{const ids=[...new Set([...adminSales.map(s=>s.user_id),...adminOrders.map(o=>o.user_id)].filter(Boolean))];return ids.map(id=>adminVendorNames[id]||'Desconhecido')},[adminSales,adminOrders,adminVendorNames])
const adminTrocaPercentual=useMemo(()=>{
  const trocaValue=adminSales.filter(s=>s.note==='Troca').reduce((a,s)=>a+s.value,0)
  return adminTotalSold>0?(trocaValue/adminTotalSold*100):(trocaValue>0?100:0)
},[adminSales,adminTotalSold])
const vendorTrocaPercentual=useMemo(()=>{
  const trocaValue=routeSales.filter(s=>s.note==='Troca').reduce((a,s)=>a+s.value,0)
  return totalSold>0?(trocaValue/totalSold*100):(trocaValue>0?100:0)
},[routeSales,totalSold])
const Tab=({id,label,icon,badge})=><button onClick={()=>setActiveTab(id)} style={{background:activeTab===id?ACCENT:'transparent',color:activeTab===id?'#fff':MUTED,border:'none',borderRadius:8,padding:'6px 10px',fontWeight:600,fontSize:11,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,minWidth:56,position:'relative'}}>
{badge>0&&<span style={{position:'absolute',top:2,right:8,background:DANGER,color:'#fff',borderRadius:99,fontSize:9,fontWeight:700,padding:'1px 5px'}}>{badge}</span>}
<span style={{fontSize:18}}>{icon}</span><span>{label}</span></button>
const FormaPgtoLabel={1:'Dinheiro',2:'Cheque',8:'Pix/Ted',16:'Boleto Sicoob',17:'Déb. Conta'}
const ProdutoCard=({p,onChange,onRemove})=><div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 12px',marginBottom:6}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
<span style={{fontWeight:600,fontSize:12,flex:1}}>{p.descricao}</span>
<button onClick={onRemove} style={{background:'none',border:'none',color:DANGER,cursor:'pointer',fontSize:14}}>✕</button>
</div>
<div style={{display:'flex',gap:6}}>
<div style={{flex:1}}><div style={{fontSize:10,color:MUTED,marginBottom:2}}>QTD</div><input type="number" min="1" value={p.quant} onChange={e=>onChange({...p,quant:parseFloat(e.target.value)||1})} onFocus={e=>e.target.select()} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 8px',fontSize:13,boxSizing:'border-box'}}/></div>
<div style={{flex:1}}><div style={{fontSize:10,color:MUTED,marginBottom:2}}>PREÇO</div><input type="number" min="0" step="0.01" value={p.precoVenda} onChange={e=>onChange({...p,precoVenda:parseFloat(e.target.value)||0})} onFocus={e=>e.target.select()} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 8px',fontSize:13,boxSizing:'border-box'}}/></div>
<div style={{flex:1}}><div style={{fontSize:10,color:MUTED,marginBottom:2}}>DESC%</div><input type="number" min="0" max="100" value={p.vDesc||0} onChange={e=>onChange({...p,vDesc:parseFloat(e.target.value)||0})} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 8px',fontSize:13,boxSizing:'border-box'}}/></div>
<div style={{flex:1,textAlign:'right'}}><div style={{fontSize:10,color:MUTED,marginBottom:2}}>TOTAL</div><div style={{fontWeight:700,color:SUCCESS,fontSize:12}}>{fmt(p.precoVenda*p.quant*(1-(p.vDesc||0)/100))}</div></div>
</div>
</div>
if(user?.id&&gpsStatus==='denied'){
  return<div style={{minHeight:'100vh',background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{background:CARD,borderRadius:16,padding:32,maxWidth:360,textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:16}}>📍</div>
      <div style={{fontWeight:800,fontSize:18,color:TEXT,marginBottom:8}}>Localização necessária</div>
      <div style={{fontSize:14,color:MUTED,marginBottom:24,lineHeight:1.5}}>Para usar o eXpande, é necessário permitir o acesso à localização. Isso é usado para registrar corretamente suas visitas.</div>
      <button onClick={checkGpsPermission} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'14px 0',fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>Tentar novamente</button>
      <button onClick={()=>supabase.auth.signOut()} style={{width:'100%',background:'none',border:'none',color:MUTED,fontWeight:600,fontSize:13,cursor:'pointer'}}>Sair</button>
    </div>
  </div>
}
if(user?.id&&gpsStatus==='checking'){
  return<div style={{minHeight:'100vh',background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{color:'#fff',fontSize:14}}>⏳ Verificando localização...</div>
  </div>
}
if(user?.id&&permsCarregadas&&!isPrivileged&&!ehEntregador&&(!selectedRoute||!dailyGoal||!dtEntrega)){
  return<div style={{minHeight:'100vh',background:SURFACE,display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
    <div style={{background:CARD,borderRadius:16,padding:24,maxWidth:400,width:'100%'}}>
      <div style={{textAlign:'center',marginBottom:20}}>
        <div style={{fontSize:36,marginBottom:8}}>🌅</div>
        <div style={{fontWeight:800,fontSize:18,color:TEXT}}>Configurar o dia</div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>ROTA</label>
        <select value={selectedRoute} onChange={e=>{setSelectedRoute(e.target.value);setDailyGoal('');setDtEntrega('')}} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:16,background:SURFACE,boxSizing:'border-box'}}>
          <option value="">Selecionar…</option>
          {routes.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {selectedRoute&&!podeMetas&&<div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:16,textAlign:'center'}}>
        <div style={{fontSize:28,marginBottom:6}}>⏳</div>
        <div style={{fontWeight:700,fontSize:14,color:TEXT,marginBottom:4}}>Aguardando o escritório</div>
        <div style={{fontSize:13,color:MUTED,marginBottom:12}}>A meta e a data de entrega da rota {selectedRoute} ainda não foram definidas para hoje.</div>
        <button onClick={()=>loadGoal(selectedRoute)} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>🔄 Verificar de novo</button>
      </div>}
      {selectedRoute&&podeMetas&&<>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>META DO DIA (R$)</label>
          <input type="number" placeholder="0,00" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:16,boxSizing:'border-box',textAlign:'center'}}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DATA DE ENTREGA</label>
          <input type="date" value={dtEntregaInput||''} onChange={e=>setDtEntregaInput(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:16,boxSizing:'border-box',textAlign:'center'}}/>
        </div>
        <button onClick={async()=>{
          if(!goalInput||isNaN(parseFloat(goalInput))){showToast('Informe a meta do dia.','error');return}
          const dt=dtEntregaInput||new Date(Date.now()+86400000).toISOString().split('T')[0]
          await handleSetGoal(dt)
          await handleSetDtEntrega(dt)
        }} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'14px 0',fontWeight:800,fontSize:15,cursor:'pointer'}}>
          🚀 Começar o Dia
        </button>
      </>}
      <button onClick={()=>supabase.auth.signOut()} style={{width:'100%',background:'none',border:'none',color:MUTED,fontWeight:600,fontSize:13,cursor:'pointer',marginTop:16}}>Sair</button>
    </div>
  </div>
}
return(<div style={{minHeight:'100vh',background:SURFACE,fontFamily:"'Inter',system-ui,sans-serif",color:TEXT,paddingBottom:72}}>
<div style={{background:'#1e293b',borderBottom:`1px solid ${BORDER}`,padding:'0 16px',position:'sticky',top:0,zIndex:100}}>
<div style={{display:'flex',alignItems:'center',gap:8,height:52}}>
<svg viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg" width="160" height="32">
<circle cx="20" cy="20" r="18" fill="white"/>
<circle cx="20" cy="20" r="15" fill="#2563EB"/>
<polyline points="11,27 16,19 21,23 29,13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
<polygon points="26,10 32,12 30,18" fill="white"/>
<text x="44" y="27" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="300" fill="white">e</text>
<text x="56" y="27" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="900" fill="white" stroke="#2563EB" strokeWidth="0.5">X</text>
<text x="70" y="27" fontFamily="Arial, sans-serif" fontSize="21" fontWeight="300" fill="white">pande</text>
</svg>
<button onClick={()=>supabase.auth.signOut()} style={{background:'none',border:`1px solid #ffffff55`,borderRadius:8,padding:'8px 16px',fontSize:13,color:'#e2e8f0',cursor:'pointer',fontWeight:600,marginLeft:'auto'}}>Sair</button></div>
</div>
<div style={{position:'fixed',bottom:0,left:0,right:0,background:CARD,borderTop:`1px solid ${BORDER}`,display:'flex',justifyContent:'space-around',padding:'6px 0',zIndex:100}}>
{!ehEntregador&&<Tab id="dashboard" label="Dashboard" icon="📊"/>}
<Tab id="clientes" label="Clientes" icon="👥"/>
{ehEntregador&&<Tab id="entregas" label="Entregas" icon="🚚"/>}
{!ehEntregador&&<Tab id="vendas" label="Vendas" icon="💰"/>}
{!ehEntregador&&<Tab id="pedido" label="Pedido" icon="🛒" badge={orders.length}/>}
{!ehEntregador&&<Tab id="relatorio" label="Relatório" icon="📈"/>}
{(usa3?pode('usuarios.ver'):isPrivileged)&&<Tab id="config" label="Config" icon="⚙️"/>}
</div>
<div style={{padding:'12px 16px'}}>
{clientePerfil&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:500,display:'flex',alignItems:'flex-end'}}>
<div style={{background:CARD,borderRadius:'16px 16px 0 0',padding:20,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
<div style={{fontWeight:800,fontSize:16}}>{clientePerfil.name}</div>
<button onClick={()=>setClientePerfil(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MUTED}}>✕</button>
</div>
<div style={{marginBottom:14}}>
<Badge color={clientePerfil.inactive?WARNING:SUCCESS}>{clientePerfil.inactive?'⛔ Inativo':'✓ Ativo'}</Badge>
<span style={{marginLeft:6}}><Badge color={ACCENT}>{clientePerfil.route}</Badge></span>
</div>
{perfilLoading?<div style={{textAlign:'center',padding:'30px 0',color:MUTED}}>⏳ Carregando histórico...</div>
:perfilData?<>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
<div style={{background:ACCENT_LIGHT,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
<div style={{fontSize:22,fontWeight:800,color:ACCENT}}>{perfilData.mixAtual}/{perfilData.mixTotal}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>MIX DE PRODUTOS</div>
</div>
<div style={{background:'#F0FDF4',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
<div style={{fontSize:22,fontWeight:800,color:SUCCESS}}>{perfilData.numPedidos}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>PEDIDOS NO CRM</div>
</div>
<div style={{background:SURFACE,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
<div style={{fontSize:16,fontWeight:800,color:TEXT}}>{fmt(perfilData.totalGeral)}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>TOTAL COMPRADO</div>
</div>
<div style={{background:SURFACE,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
<div style={{fontSize:16,fontWeight:800,color:TEXT}}>{perfilData.numPedidos>0?fmt(perfilData.totalGeral/perfilData.numPedidos):fmt(0)}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>TICKET MÉDIO</div>
</div>
</div>
{perfilData.comprados.length>0&&<>
<div style={{fontWeight:700,fontSize:13,marginBottom:8,color:SUCCESS}}>✅ Produtos que compra ({perfilData.comprados.length})</div>
{perfilData.comprados.map(p=><div key={p.erp_code} style={{background:'#F0FDF4',border:`1px solid ${SUCCESS}22`,borderRadius:8,padding:'8px 12px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<div><div style={{fontWeight:600,fontSize:12}}>{p.descricao}</div><div style={{fontSize:10,color:MUTED}}>Qtd total: {p.quant_total} • Última: {p.ultima_compra}</div></div>
<div style={{textAlign:'right'}}><div style={{fontWeight:700,color:SUCCESS,fontSize:12}}>{fmt(p.total_comprado)}</div></div>
</div>)}
</>}
{perfilData.naoComprados.length>0&&<>
<div style={{fontWeight:700,fontSize:13,marginBottom:8,marginTop:12,color:WARNING}}>💡 Ainda não compra ({perfilData.naoComprados.length})</div>
{perfilData.naoComprados.map(p=><div key={p.erp_code} style={{background:'#FFFBEB',border:`1px solid ${WARNING}22`,borderRadius:8,padding:'8px 12px',marginBottom:6}}>
<div style={{fontWeight:600,fontSize:12}}>{p.descricao}</div>
{p.codigo_proprio&&<div style={{fontSize:10,color:MUTED}}>Cód: {p.codigo_proprio}</div>}
</div>)}
</>}
{perfilData.comprados.length===0&&perfilData.naoComprados.length===0&&<div style={{textAlign:'center',padding:'20px 0',color:MUTED}}>Nenhum histórico ainda.<br/>Os dados aparecem após exportar pedidos.</div>}
</>:null}
<div style={{display:'flex',gap:8,marginTop:16}}>
<button onClick={()=>setClientePerfil(null)} style={{flex:1,background:SURFACE,color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>Fechar</button>
<button onClick={()=>setModalNaoComprou(true)} style={{flex:1,background:'#FEF2F2',color:DANGER,border:`1px solid ${DANGER}33`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>❌ Não comprou</button>
<button onClick={()=>{setPedidoCliente(clientePerfil);setClientePerfil(null);setActiveTab('pedido')}} style={{flex:2,background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>🛒 Fazer Pedido</button>
</div>
</div>
</div>}
{modalNaoComprou&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:700,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
<div style={{background:CARD,borderRadius:16,padding:20,width:'100%',maxWidth:360}}>
<div style={{fontWeight:800,fontSize:16,marginBottom:4}}>❌ Cliente não comprou</div>
<div style={{fontSize:13,color:MUTED,marginBottom:16}}>{clientePerfil?.name}</div>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:6}}>MOTIVO</label>
{['Cliente fechado / não atendeu','Cliente ausente','Sem interesse no momento','Já tem estoque suficiente','Cliente devendo','Pediu para retornar depois','Outro'].map(m=>
<button key={m} onClick={()=>setMotivoNaoComprou(m)} style={{width:'100%',textAlign:'left',background:motivoNaoComprou===m?ACCENT_LIGHT:SURFACE,border:`1px solid ${motivoNaoComprou===m?ACCENT:BORDER}`,borderRadius:8,padding:'10px 12px',marginBottom:6,fontSize:13,fontWeight:600,color:motivoNaoComprou===m?ACCENT:TEXT,cursor:'pointer'}}>{m}</button>
)}
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:6,marginTop:8}}>OBSERVAÇÃO (opcional)</label>
<textarea value={obsNaoComprou} onChange={e=>setObsNaoComprou(e.target.value)} rows={3} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',marginBottom:16,fontFamily:'inherit',resize:'none'}}/>
<div style={{display:'flex',gap:8}}>
<button onClick={()=>{setModalNaoComprou(false);setMotivoNaoComprou('');setObsNaoComprou('')}} style={{flex:1,background:SURFACE,color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
<button onClick={salvarNaoComprou} disabled={salvandoNaoComprou} style={{flex:2,background:salvandoNaoComprou?MUTED:DANGER,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:salvandoNaoComprou?'not-allowed':'pointer'}}>{salvandoNaoComprou?'Salvando…':'Registrar'}</button>
</div>
</div>
</div>}
{modalProdutosEdicao&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:600,display:'flex',alignItems:'flex-end'}}>
<div style={{background:CARD,borderRadius:'16px 16px 0 0',padding:20,width:'100%',height:'90vh',display:'flex',flexDirection:'column'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
<div style={{fontWeight:800,fontSize:16}}>📦 Produtos</div>
<button onClick={()=>setModalProdutosEdicao(false)} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Salvar</button>
</div>
<input type="text" placeholder="🔍 Buscar produto…" value={modalProdutoSearch} onChange={e=>setModalProdutoSearch(e.target.value)}
style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:12}}/>
<div style={{overflowY:'auto',flex:1}}>
{todosProdutos.filter(p=>p.descricao?.toLowerCase().includes(modalProdutoSearch.toLowerCase())||p.codigo_proprio?.toLowerCase().includes(modalProdutoSearch.toLowerCase())).map(p=>{
const prod={codigo:p.erp_code,descricao:p.descricao,codigoProprio:p.codigo_proprio,precoVenda:p.preco_venda}
const noLista=editOrderProdutos.find(x=>x.codigo===prod.codigo)
return<div key={prod.codigo} style={{background:noLista?ACCENT_LIGHT:SURFACE,border:`1px solid ${noLista?ACCENT:BORDER}`,borderRadius:10,padding:'10px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13,color:noLista?ACCENT:TEXT}}>{prod.descricao}</div>
<div style={{fontSize:11,color:MUTED}}>{fmt(prod.precoVenda||0)}</div>
</div>
<div style={{display:'flex',alignItems:'center',gap:6}}>
<button onMouseDown={()=>{if(noLista&&noLista.quant<=1){setEditOrderProdutos(prev=>prev.filter(x=>x.codigo!==prod.codigo))}else if(noLista){setEditOrderProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:x.quant-1}:x))}}} style={{width:32,height:32,background:noLista?DANGER:'#eee',color:noLista?'#fff':MUTED,border:'none',borderRadius:6,fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
<input type="number" min="0" value={noLista?.quant||0} onChange={e=>{const q=parseFloat(e.target.value)||0;if(q===0){setEditOrderProdutos(prev=>prev.filter(x=>x.codigo!==prod.codigo))}else if(noLista){setEditOrderProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:q}:x))}else{setEditOrderProdutos(prev=>[...prev,{...prod,quant:q,vDesc:0}])}}} onFocus={e=>e.target.select()} style={{width:44,textAlign:'center',border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 4px',fontSize:14,fontWeight:700}}/>
<button onMouseDown={()=>{if(noLista){setEditOrderProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:x.quant+1}:x))}else{setEditOrderProdutos(prev=>[...prev,{...prod,quant:1,vDesc:0}])}}} style={{width:32,height:32,background:ACCENT,color:'#fff',border:'none',borderRadius:6,fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
</div>
</div>})}
</div>
</div>
</div>}
{modalProdutos&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:600,display:'flex',alignItems:'flex-end'}}>
<div style={{background:CARD,borderRadius:'16px 16px 0 0',padding:20,width:'100%',height:'90vh',display:'flex',flexDirection:'column'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
<div style={{fontWeight:800,fontSize:16}}>📦 Produtos</div>
<button onClick={()=>setModalProdutos(false)} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Salvar</button>
</div>
<input type="text" placeholder="🔍 Buscar produto…" value={modalProdutoSearch} onChange={e=>setModalProdutoSearch(e.target.value)}
style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:12}}/>
<div style={{overflowY:'auto',flex:1}}>
{todosProdutos.filter(p=>p.descricao?.toLowerCase().includes(modalProdutoSearch.toLowerCase())||p.codigo_proprio?.toLowerCase().includes(modalProdutoSearch.toLowerCase())).map(p=>{
const prod={codigo:p.erp_code,descricao:p.descricao,codigoProprio:p.codigo_proprio,precoVenda:p.preco_venda}
const noLista=pedidoProdutos.find(x=>x.codigo===prod.codigo)
return<div key={prod.codigo} style={{background:noLista?ACCENT_LIGHT:SURFACE,border:`1px solid ${noLista?ACCENT:BORDER}`,borderRadius:10,padding:'10px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13,color:noLista?ACCENT:TEXT}}>{prod.descricao}</div>
<div style={{fontSize:11,color:MUTED}}>{fmt(prod.precoVenda||0)}</div>
</div>
<div style={{display:'flex',alignItems:'center',gap:6}}>
<button onMouseDown={()=>{if(noLista&&noLista.quant<=1){setPedidoProdutos(prev=>prev.filter(x=>x.codigo!==prod.codigo))}else if(noLista){setPedidoProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:x.quant-1}:x))}}} style={{width:32,height:32,background:noLista?DANGER:'#eee',color:noLista?'#fff':MUTED,border:'none',borderRadius:6,fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
<input type="number" min="0" value={noLista?.quant||0} onChange={e=>{const q=parseFloat(e.target.value)||0;if(q===0){setPedidoProdutos(prev=>prev.filter(x=>x.codigo!==prod.codigo))}else if(noLista){setPedidoProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:q}:x))}else{setPedidoProdutos(prev=>[...prev,{...prod,quant:q,vDesc:0}])}}} onFocus={e=>e.target.select()} style={{width:44,textAlign:'center',border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 4px',fontSize:14,fontWeight:700}}/>
<button onMouseDown={()=>{if(noLista){setPedidoProdutos(prev=>prev.map(x=>x.codigo===prod.codigo?{...x,quant:x.quant+1}:x))}else{setPedidoProdutos(prev=>[...prev,{...prod,quant:1,vDesc:0}])}}} style={{width:32,height:32,background:ACCENT,color:'#fff',border:'none',borderRadius:6,fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
</div>
</div>})}
</div>
</div>
</div>}
{produtoModal&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
<div style={{background:CARD,borderRadius:16,padding:20,width:'100%',maxWidth:340}}>
<div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{produtoModal.produto.descricao}</div>
<div style={{fontSize:12,color:MUTED,marginBottom:16}}>{fmt(produtoModal.produto.precoVenda)} por unidade</div>
<div style={{marginBottom:12}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>QUANTIDADE</label>
<input type="number" min="1" value={produtoModalQuant} autoFocus onChange={e=>setProdutoModalQuant(parseFloat(e.target.value)||1)} onFocus={e=>e.target.select()} onKeyDown={e=>e.key==='Enter'&&confirmarProdutoModal()} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:18,boxSizing:'border-box',textAlign:'center',fontWeight:700}}/>
</div>
<div style={{marginBottom:16}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DESCONTO %</label>
<input type="number" min="0" max="100" value={produtoModalDesc} onChange={e=>setProdutoModalDesc(parseFloat(e.target.value)||0)} onFocus={e=>e.target.select()} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:16,boxSizing:'border-box',textAlign:'center'}}/>
</div>
<div style={{background:ACCENT_LIGHT,borderRadius:8,padding:'10px 12px',textAlign:'center',marginBottom:16}}>
<div style={{fontSize:11,color:MUTED,marginBottom:2}}>TOTAL</div>
<div style={{fontWeight:800,fontSize:20,color:ACCENT}}>{fmt(produtoModal.produto.precoVenda*produtoModalQuant*(1-produtoModalDesc/100))}</div>
</div>
<div style={{display:'flex',gap:8}}>
<button onClick={()=>setProdutoModal(null)} style={{flex:1,background:SURFACE,color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
<button onClick={confirmarProdutoModal} style={{flex:2,background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>+ Adicionar</button>
</div>
</div>
</div>}
{toast&&<div style={{position:'fixed',top:60,left:16,right:16,zIndex:1000,background:toast.type==='error'?DANGER:SUCCESS,color:'#fff',borderRadius:10,padding:'12px 16px',fontWeight:600,fontSize:13,boxShadow:'0 4px 20px #0003',textAlign:'center'}}>{toast.type==='error'?'❌':'✅'} {toast.msg}</div>}
{activeTab!=='relatorio'&&<div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
{routes.length>0&&<div style={{flex:1,minWidth:150,background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'8px 12px'}}>
<div style={{fontWeight:700,fontSize:11,marginBottom:3,color:MUTED}}>ROTA DO DIA</div>
<select value={selectedRoute} onChange={e=>{setSelectedRoute(e.target.value);setDailyGoal('');setDtEntrega('')}} style={{width:'100%',border:'none',background:'transparent',fontWeight:700,fontSize:13,color:TEXT,outline:'none'}}><option value="">Selecionar…</option>
{routes.map(r=><option key={r} value={r}>{r}</option>)}
</select>
</div>}
{selectedRoute&&!ehEntregador&&<div style={{flex:'0 0 auto',background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'8px 12px',display:'flex',flexDirection:'column',gap:8}}>
{isAdmin&&<div>
<div style={{fontWeight:700,fontSize:11,marginBottom:3,color:MUTED}}>DATA</div>
<input type="date" value={adminDate} onChange={e=>setAdminDate(e.target.value)} style={{border:`1px solid ${BORDER}`,borderRadius:6,padding:'4px 6px',fontSize:12}}/>
</div>}
<div>
<div style={{fontWeight:700,fontSize:11,marginBottom:3,color:MUTED}}>META DO DIA</div>
{isAdmin?<span style={{fontWeight:800,color:ACCENT,fontSize:14}}>{adminGoalValue?fmt(adminGoalValue):(usa3&&pode('vendas.metas')?<span style={{fontSize:11,fontWeight:600,color:MUTED}}>defina abaixo ↓</span>:'—')}</span>
:dailyGoal?<div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontWeight:800,color:ACCENT,fontSize:14}}>{fmt(dailyGoal)}</span>{podeMetas&&<button onClick={()=>setDailyGoal('')} style={{background:'none',border:'none',color:MUTED,cursor:'pointer',fontSize:12}}>✏️</button>}</div>
:<div style={{display:'flex',gap:4}}><input type="number" placeholder="0,00" value={goalInput} onChange={e=>setGoalInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSetGoal()} style={{width:80,border:`1px solid ${BORDER}`,borderRadius:6,padding:'4px 6px',fontSize:12}}/><button onClick={handleSetGoal} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:6,padding:'4px 8px',fontWeight:700,cursor:'pointer',fontSize:11}}>OK</button></div>}
</div>
<div>
<div style={{fontWeight:700,fontSize:11,marginBottom:3,color:MUTED}}>DATA ENTREGA</div>
{isAdmin?<span style={{fontWeight:800,color:ACCENT,fontSize:13}}>{adminDtEntregaValue?new Date(adminDtEntregaValue+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</span>
:dtEntrega?<div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontWeight:800,color:ACCENT,fontSize:13}}>{new Date(dtEntrega+'T12:00:00').toLocaleDateString('pt-BR')}</span>{podeMetas&&<button onClick={()=>setDtEntrega('')} style={{background:'none',border:'none',color:MUTED,cursor:'pointer',fontSize:12}}>✏️</button>}</div>
:<div style={{display:'flex',gap:4}}><input type="date" value={dtEntregaInput||''} onChange={e=>setDtEntregaInput(e.target.value)} style={{border:`1px solid ${BORDER}`,borderRadius:6,padding:'4px 6px',fontSize:11}}/><button onClick={()=>handleSetDtEntrega(dtEntregaInput||new Date(Date.now()+86400000).toISOString().split('T')[0])} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:6,padding:'4px 8px',fontWeight:700,cursor:'pointer',fontSize:11}}>OK</button></div>}
</div>
</div>}
</div>}
{activeTab==='dashboard'&&<div>
{isPrivileged&&usa3&&pode('vendas.metas')&&<MetasDoDia supabase={supabase} showToast={showToast} rota={selectedRoute}/>}
{isPrivileged&&<>
{allRoutesLoading?<div style={{textAlign:'center',padding:'20px 0',color:MUTED,fontSize:13}}>⏳ Carregando visão geral do dia...</div>:<>
{allRoutesSummary.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
<div style={{padding:'12px 14px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:13}}>🗺️ Comparação entre Rotas (hoje)</div>
{allRoutesSummary.map((r,i)=><div key={r.route} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{r.route}</div>
<div style={{fontSize:11,color:MUTED}}>{r.count} venda(s)</div>
</div>
<Badge color={ACCENT}>{fmt(r.total)}</Badge>
</div>)}
</div>}
{vendorRanking.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
<div style={{padding:'12px 14px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:13}}>🏆 Ranking de Vendedores (hoje)</div>
{vendorRanking.map((v,i)=><div key={v.user_id} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE,display:'flex',alignItems:'center',gap:8}}>
<div style={{width:24,fontWeight:800,fontSize:13,color:i===0?WARNING:MUTED}}>{i+1}º</div>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{v.name}</div>
<div style={{fontSize:11,color:MUTED}}>{v.count} venda(s)</div>
</div>
<Badge color={SUCCESS}>{fmt(v.total)}</Badge>
</div>)}
</div>}
</>}
</>}
{!selectedRoute?<div style={{textAlign:'center',padding:'60px 20px',color:MUTED}}><div style={{fontSize:48,marginBottom:12}}>🗺️</div><div style={{fontWeight:700,fontSize:16,color:TEXT}}>Selecione uma rota para começar</div></div>
:isPrivileged?<>
{adminVendorsToday.length>0&&<div style={{background:ACCENT_LIGHT,border:`1px solid ${ACCENT}33`,borderRadius:10,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
<span style={{fontSize:16}}>👤</span>
<span style={{fontSize:12,color:MUTED,fontWeight:600}}>Atendido por:</span>
<span style={{fontWeight:700,fontSize:13,color:ACCENT}}>{adminVendorsToday.join(', ')}</span>
</div>}
{adminLoading?<div style={{textAlign:'center',padding:'30px 0',color:MUTED}}>⏳ Carregando dados da rota...</div>:<>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
<KpiCard label="Na Rota" value={adminActiveRouteClients.length} sub="clientes ativos" color={ACCENT}/>
<KpiCard label="Atendidos" value={adminSoldClientIds.size} sub={`${adminActiveRouteClients.length>0?Math.round((adminSoldClientIds.size/adminActiveRouteClients.length)*100):0}%`} color={SUCCESS}/>
<KpiCard label="Restantes" value={adminActiveRouteClients.length-adminSoldClientIds.size} sub={adminActiveRouteClients.length-adminSoldClientIds.size===0?'Concluído! 🎉':'a visitar'} color={adminActiveRouteClients.length-adminSoldClientIds.size===0?SUCCESS:WARNING}/>
<KpiCard label="Total Vendido" value={fmt(adminTotalSold)} sub={`${adminSales.length} venda(s)`} color={ACCENT}/>
</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<span style={{fontWeight:700,fontSize:13}}>🔄 Percentual de Trocas (hoje)</span>
<span style={{fontWeight:800,fontSize:18,color:adminTrocaPercentual>=10?DANGER:adminTrocaPercentual>0?WARNING:SUCCESS}}>{adminTrocaPercentual.toFixed(1)}%</span>
</div>
{adminOrders.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
<div style={{padding:'12px 14px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:13,color:WARNING}}>📋 Pedidos Pendentes ({adminOrders.length}) — {fmt(adminTotalPendente)}</div>
{adminOrders.map((o,i)=><div key={o.id} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{o.client_name}</div>
<div style={{fontSize:11,color:MUTED}}>{o.situacao}{adminVendorNames[o.user_id]?' • '+adminVendorNames[o.user_id]:''}</div>
</div>
{o.gps_lat&&o.gps_lng&&<a href={`https://www.google.com/maps?q=${o.gps_lat},${o.gps_lng}`} target="_blank" rel="noopener noreferrer" style={{fontSize:16,textDecoration:'none'}} title="Ver localização">📍</a>}
<Badge color={WARNING}>{fmt(o.total)}</Badge>
</div>)}
</div>}
{adminVisitasSemVenda.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginTop:12}}>
<div style={{padding:'12px 14px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:13,color:DANGER}}>❌ Visitas sem Venda ({adminVisitasSemVenda.length})</div>
{[...adminVisitasSemVenda].reverse().map((v,i)=><div key={v.id} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{v.client_name}</div>
<div style={{fontSize:11,color:MUTED}}>{v.visit_time} • {v.motivo}{adminVendorNames[v.user_id]?' • '+adminVendorNames[v.user_id]:''}</div>
{v.observacao&&<div style={{fontSize:11,color:MUTED,fontStyle:'italic',marginTop:2}}>"{v.observacao}"</div>}
</div>
{v.gps_lat&&v.gps_lng&&<a href={`https://www.google.com/maps?q=${v.gps_lat},${v.gps_lng}`} target="_blank" rel="noopener noreferrer" style={{fontSize:16,textDecoration:'none'}} title="Ver localização">📍</a>}
</div>)}
</div>}
</>}
</>:<>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
<KpiCard label="Na Rota" value={activeRouteClients.length} sub="clientes ativos" color={ACCENT}/>
<KpiCard label="Atendidos" value={activeSoldIds.size} sub={`${activeRouteClients.length>0?Math.round((activeSoldIds.size/activeRouteClients.length)*100):0}%`} color={SUCCESS}/>
<KpiCard label="Restantes" value={remaining} sub={remaining===0?'Concluído! 🎉':'a visitar'} color={remaining===0?SUCCESS:WARNING}/>
<KpiCard label="Ticket Médio" value={fmt(avgTicket)} sub={ticketMeta>0?`Meta: ${fmt(ticketMeta)}`:`${activeSoldIds.size} venda(s)`} color={ticketColor}/>
</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<span style={{fontWeight:700,fontSize:13}}>🔄 Percentual de Trocas (hoje)</span>
<span style={{fontWeight:800,fontSize:18,color:vendorTrocaPercentual>=10?DANGER:vendorTrocaPercentual>0?WARNING:SUCCESS}}>{vendorTrocaPercentual.toFixed(1)}%</span>
</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
<span style={{fontWeight:700,fontSize:13}}>💰 Total Vendido</span>
<span style={{fontWeight:800,fontSize:18,color:totalSold>=(dailyGoal||Infinity)?SUCCESS:ACCENT}}>{fmt(totalSold)}</span>
</div>
{dailyGoal>0&&<><div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:MUTED,marginBottom:6}}><span>Meta: {fmt(dailyGoal)}</span><span>{goalProgress.toFixed(1)}%</span></div>
<div style={{background:SURFACE,borderRadius:99,height:8,overflow:'hidden'}}><div style={{width:`${goalProgress}%`,height:'100%',background:goalProgress>=100?SUCCESS:ACCENT,borderRadius:99,transition:'width 0.4s'}}/></div>
<div style={{textAlign:'right',marginTop:4,fontSize:11,color:MUTED}}>Faltam {fmt(Math.max(dailyGoal-totalSold,0))}</div></>}
</div>
{inactiveSoldClients.length>0&&<div style={{background:'#FFF7ED',border:`1.5px solid ${WARNING}55`,borderRadius:12,padding:'12px 14px',marginBottom:12}}>
<div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
<span>⚠️</span><span style={{fontWeight:700,fontSize:13,color:WARNING}}>Inativos Atendidos</span>
<Badge color={WARNING}>{inactiveSoldClients.length}</Badge>
<span style={{marginLeft:'auto',fontWeight:800,color:WARNING,fontSize:13}}>{fmt(inactiveSoldClients.reduce((a,s)=>a+s.value,0))}</span>
</div>
{inactiveSoldClients.map(s=><div key={s.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderTop:`1px solid ${WARNING}22`}}>
<span style={{fontWeight:600}}>{s.client_name}</span><Badge color={WARNING}>{fmt(s.value)}</Badge>
</div>)}
</div>}
</>}
</div>}
{activeTab==='clientes'&&<div>
{clients.length===0?<div style={{textAlign:'center',padding:'60px 20px',color:MUTED}}><div style={{fontSize:48,marginBottom:12}}>📂</div><div style={{fontWeight:700,fontSize:16,color:TEXT}}>Nenhuma planilha importada</div></div>
:<><div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center'}}>
<input type="text" placeholder="🔍 Buscar cliente…" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14}}/>
<Badge color={ACCENT}>{filteredClients.length}</Badge>
</div>
{selectedRoute&&Object.keys(ordemEdit).length>0&&<button onClick={()=>salvarOrdem(selectedRoute)} disabled={ordemSaving} style={{width:'100%',background:ordemSaving?MUTED:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:13,cursor:'pointer',marginBottom:8}}>
{ordemSaving?'Salvando…':'💾 Salvar Ordem'}
</button>}
{filteredClients.map((c,i)=><div key={c.id} style={{background:c.inactive?'#FFF7ED':CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:'10px 14px',marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
<input type="number" min="1" value={ordemEdit[c.id]!==undefined?ordemEdit[c.id]:c.ordem||''} onChange={e=>setOrdemEdit(prev=>({...prev,[c.id]:e.target.value}))} onFocus={e=>e.target.select()} style={{width:44,border:`1px solid ${BORDER}`,borderRadius:6,padding:'6px 4px',fontSize:13,fontWeight:700,textAlign:'center'}}/>
<div style={{flex:1,cursor:'pointer'}} onClick={()=>abrirPerfil(c)}>
<div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
<div style={{fontSize:11,color:MUTED,marginTop:2}}><Badge color={ACCENT}>{c.route}</Badge></div>
</div>
<div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
{c.inactive?<Badge color={WARNING}>⛔ Inativo</Badge>:<Badge color={SUCCESS}>✓ Ativo</Badge>}
{soldClientIds.has(c.id)?<Badge color={SUCCESS}>✅ Vendido</Badge>:selectedRoute===c.route?<Badge color={MUTED}>⏳ Pendente</Badge>:null}
</div>
</div>)}
</>}
</div>}
{activeTab==='vendas'&&<div>
{(()=>{
const vendasBase=isPrivileged?adminSales:(selectedRoute?routeSales:sales)
const pedidosBase=isPrivileged?adminOrders:(selectedRoute?routeOrders:orders)
const totalExportado=vendasBase.filter(s=>!['Bonificação','Troca'].includes(s.note)).reduce((a,s)=>a+s.value,0)
const totalPendente=pedidosBase.filter(o=>!['Bonificação','Troca'].includes(o.situacao)).reduce((a,o)=>a+o.total,0)
const totalGeral=totalExportado+totalPendente
const metaBase=isPrivileged?adminGoalValue:dailyGoal
const progresso=metaBase>0?Math.min((totalGeral/metaBase)*100,100):0
return<>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
<span style={{fontWeight:700,fontSize:14}}>💰 Total do Dia</span>
<span style={{fontWeight:800,fontSize:18,color:ACCENT}}>{fmt(totalGeral)}</span>
</div>
{metaBase>0&&<>
<div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:MUTED,marginBottom:6}}>
<span>Meta: {fmt(metaBase)}</span><span>{progresso.toFixed(1)}%</span>
</div>
<div style={{background:SURFACE,borderRadius:99,height:8,overflow:'hidden'}}>
<div style={{width:`${progresso}%`,height:'100%',background:progresso>=100?SUCCESS:ACCENT,borderRadius:99,transition:'width 0.4s'}}/>
</div>
<div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11,color:MUTED}}>
<span>✅ Exportado: {fmt(totalExportado)}</span>
<span>📋 Pendente: {fmt(totalPendente)}</span>
</div>
</>}
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:12}}>
<div style={{background:SURFACE,borderRadius:8,padding:'8px',textAlign:'center'}}>
<div style={{fontWeight:800,fontSize:16,color:SUCCESS}}>{vendasBase.length}</div>
<div style={{fontSize:10,color:MUTED,fontWeight:600}}>EXPORTADOS</div>
</div>
<div style={{background:SURFACE,borderRadius:8,padding:'8px',textAlign:'center'}}>
<div style={{fontWeight:800,fontSize:16,color:WARNING}}>{pedidosBase.length}</div>
<div style={{fontSize:10,color:MUTED,fontWeight:600}}>PENDENTES</div>
</div>
<div style={{background:SURFACE,borderRadius:8,padding:'8px',textAlign:'center'}}>
<div style={{fontWeight:800,fontSize:16,color:ACCENT}}>{vendasBase.length+pedidosBase.length}</div>
<div style={{fontSize:10,color:MUTED,fontWeight:600}}>TOTAL</div>
</div>
</div>
</div>
{vendasBase.length>0&&<>
<div style={{fontWeight:700,fontSize:13,marginBottom:8,color:SUCCESS}}>✅ Exportados para eGestor ({vendasBase.length})</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
{[...vendasBase].reverse().map((s,i)=><div key={s.id} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE}}>
<div style={{display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{s.client_name}</div>
<div style={{fontSize:11,color:MUTED}}>{new Date(s.date+'T12:00:00').toLocaleDateString('pt-BR')} • {s.sale_time}{s.route?' • '+s.route:''}{s.note?' • '+s.note:''}</div>
</div>
<Badge color={SUCCESS}>{fmt(s.value)}</Badge>
</div>
{isPrivileged&&adminSalesItems[s.id]&&<div style={{fontSize:11,color:MUTED,marginTop:6,paddingTop:6,borderTop:`1px solid ${BORDER}`}}>
{adminSalesItems[s.id].map(item=>`${item.descricao} x${item.quant}`).join(', ')}
</div>}
</div>)}
</div>
</>}
{pedidosBase.length>0&&<>
<div style={{fontWeight:700,fontSize:13,marginBottom:8,color:WARNING}}>📋 A Exportar ({pedidosBase.length})</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',marginBottom:12}}>
{pedidosBase.map((o,i)=><div key={o.id} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?CARD:SURFACE,display:'flex',alignItems:'center',gap:8}}>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{o.client_name}</div>
<div style={{fontSize:11,color:MUTED}}>{o.situacao} • {o.produtos?.length} produto(s)</div>
</div>
<Badge color={WARNING}>{fmt(o.total)}</Badge>
</div>)}
</div>
{pedidosBase.length>0&&<button onClick={()=>setActiveTab('pedido')} style={{width:'100%',background:SUCCESS,color:'#fff',border:'none',borderRadius:10,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>🚀 Ir para Exportar</button>}
</>}
{vendasBase.length===0&&pedidosBase.length===0&&<div style={{textAlign:'center',padding:'40px 20px',color:MUTED,background:CARD,border:`1px solid ${BORDER}`,borderRadius:12}}><div style={{fontSize:36,marginBottom:8}}>📋</div><div style={{fontWeight:700}}>Nenhuma venda hoje</div></div>}
</>})()}
</div>}
{activeTab==='pedido'&&<div>
{editandoOrder&&<div style={{position:'fixed',inset:0,background:'#0008',zIndex:500,display:'flex',alignItems:'flex-end'}}>
<div style={{background:CARD,borderRadius:'16px 16px 0 0',padding:20,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
<div style={{fontWeight:800,fontSize:15}}>✏️ Editar Pedido</div>
<button onClick={()=>setEditandoOrder(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:MUTED}}>✕</button>
</div>
<div style={{fontWeight:600,fontSize:13,color:ACCENT,marginBottom:12}}>{editandoOrder.client_name}</div>
<select value={editOrderSituacao} onChange={e=>setEditOrderSituacao(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option>Pedido S/ NFe</option><option>Pedido C/ NFe</option><option>Bonificação</option><option>Troca</option>
</select>
<select value={editOrderFormaPgto} onChange={e=>setEditOrderFormaPgto(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="1">Dinheiro</option><option value="2">Cheque</option><option value="8">Pix/Ted</option><option value="16">Boleto Sicoob</option><option value="17">Débito em Conta</option>
</select>
<button onClick={abrirModalProdutosEdicao} style={{width:'100%',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,color:ACCENT,cursor:'pointer',marginBottom:8}}>
+ Adicionar Produto
</button>
{editOrderProdutos.map(p=><ProdutoCard key={p.codigo} p={p} onChange={np=>setEditOrderProdutos(prev=>prev.map(x=>x.codigo===p.codigo?np:x))} onRemove={()=>setEditOrderProdutos(prev=>prev.filter(x=>x.codigo!==p.codigo))}/>)}
<div style={{textAlign:'right',fontWeight:800,fontSize:16,color:ACCENT,margin:'8px 0 12px'}}>Total: {fmt(editOrderProdutos.reduce((acc,p)=>acc+p.precoVenda*p.quant*(1-(p.vDesc||0)/100),0))}</div>
<div style={{display:'flex',gap:8}}>
<button onClick={()=>setEditandoOrder(null)} style={{flex:1,background:SURFACE,color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>Cancelar</button>
<button onClick={salvarEdicaoOrder} style={{flex:2,background:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>💾 Salvar</button>
</div>
</div>
</div>}
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🛒 Novo Pedido</div>
{pedidoCliente?<div style={{display:'flex',alignItems:'center',gap:8,background:ACCENT_LIGHT,borderRadius:8,padding:'10px 12px',marginBottom:8}}>
<span style={{fontWeight:700,color:ACCENT,flex:1,fontSize:13}}>{pedidoCliente.name}</span>
<button onClick={()=>setPedidoCliente(null)} style={{background:'none',border:'none',color:DANGER,cursor:'pointer',fontSize:16}}>✕</button>
</div>
:<div style={{marginBottom:8}}>
<input type="text" placeholder="🔍 Buscar cliente na rota…" value={pedidoClienteSearch||''} onChange={e=>setPedidoClienteSearch(e.target.value)}
style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:8}}/>
{!selectedRoute?<div style={{textAlign:'center',padding:'20px',color:MUTED,fontSize:13}}>Selecione uma rota no Dashboard primeiro</div>
:<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',maxHeight:400,overflowY:'auto'}}>
{routeClients.filter(c=>c.name.toLowerCase().includes((pedidoClienteSearch||'').toLowerCase())).map((c,i)=>{
const vendido=soldClientIds.has(c.id)||orders.some(o=>o.client_id===c.id||o.client_erp_code===c.erp_code)
const temPedido=orders.some(o=>o.client_id===c.id||o.client_erp_code===c.erp_code)
return<div key={c.id} onClick={()=>abrirPerfil(c)} style={{padding:'10px 14px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',gap:10,cursor:'pointer',background:vendido?'#F0FDF4':c.inactive?'#FFF7ED':'transparent'}}>
<div style={{width:26,height:26,borderRadius:99,background:temPedido?WARNING:vendido?SUCCESS:c.inactive?'#FEE2E2':BORDER,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,color:'#fff',fontWeight:700}}>
{temPedido?'📋':vendido?'✓':c.inactive?'⛔':i+1}
</div>
<div style={{flex:1}}>
<div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
<div style={{fontSize:11,color:MUTED}}>{temPedido?'Pedido pendente':vendido?'Atendido':'Aguardando visita'}</div>
</div>
<span style={{color:MUTED,fontSize:16}}>›</span>
</div>})}
</div>}
</div>}
<select value={pedidoSituacao} onChange={e=>setPedidoSituacao(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option>Pedido S/ NFe</option><option>Pedido C/ NFe</option><option>Bonificação</option><option>Troca</option>
</select>
{['Pedido S/ NFe','Pedido C/ NFe'].includes(pedidoSituacao)&&<>
<select value={pedidoFormaPgto} onChange={e=>setPedidoFormaPgto(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="1">Dinheiro</option><option value="2">Cheque</option><option value="8">Pix/Ted</option><option value="16">Boleto Sicoob</option><option value="17">Débito em Conta</option>
</select>
<div style={{marginBottom:8}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>PRAZO DE VENCIMENTO</label>
<div style={{display:'flex',gap:8}}>
{[7,14,21,28].map(dias=>{
const dataVenc=new Date(Date.now()+dias*86400000).toISOString().split('T')[0]
const selecionado=pedidoVencimento===dataVenc
return<button key={dias} onClick={()=>setPedidoVencimento(dataVenc)} style={{flex:1,background:selecionado?ACCENT:SURFACE,color:selecionado?'#fff':MUTED,border:`1px solid ${selecionado?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontSize:13,fontWeight:700,cursor:'pointer'}}>{dias}d</button>
})}
</div>
{pedidoVencimento&&<div style={{fontSize:11,color:MUTED,marginTop:6,textAlign:'center'}}>Vencimento: {new Date(pedidoVencimento+'T12:00:00').toLocaleDateString('pt-BR')}</div>}
</div>
</>}
<button onClick={abrirModalProdutos} style={{width:'100%',background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,color:ACCENT,cursor:'pointer',marginBottom:8}}>+ Adicionar Produto</button>
{pedidoProdutos.map(p=><ProdutoCard key={p.codigo} p={p} onChange={np=>setPedidoProdutos(prev=>prev.map(x=>x.codigo===p.codigo?np:x))} onRemove={()=>setPedidoProdutos(prev=>prev.filter(x=>x.codigo!==p.codigo))}/>)}
{pedidoProdutos.length>0&&<div style={{textAlign:'right',fontWeight:800,fontSize:18,color:ACCENT,margin:'8px 0 12px'}}>Total: {fmt(totalPedido)}</div>}
<button onClick={salvarPedido} disabled={pedidoLoading} style={{width:'100%',background:pedidoLoading?MUTED:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'14px 0',fontWeight:700,fontSize:15,cursor:pedidoLoading?'not-allowed':'pointer'}}>
{pedidoLoading?'Salvando…':'💾 Salvar Pedido'}
</button>
</div>
{orders.length>0&&<>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
<div style={{fontWeight:700,fontSize:14}}>Pedidos Pendentes ({orders.length})</div>
<div style={{fontWeight:800,fontSize:13,color:ACCENT}}>{fmt(orders.reduce((a,o)=>a+o.total,0))}</div>
</div>
{orders.map(o=><div key={o.id} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'12px 14px',marginBottom:8}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
<div><div style={{fontWeight:700,fontSize:13}}>{o.client_name}</div><div style={{fontSize:11,color:MUTED}}>{o.situacao} • {FormaPgtoLabel[o.forma_pgto]||o.forma_pgto}</div></div>
<div style={{textAlign:'right'}}><div style={{fontWeight:800,color:SUCCESS,fontSize:15}}>{fmt(o.total)}</div><div style={{fontSize:10,color:MUTED}}>{o.produtos?.length} produto(s)</div></div>
</div>
<div style={{fontSize:11,color:MUTED,marginBottom:8}}>{o.produtos?.map(p=>`${p.descricao} x${p.quant}`).join(', ')}</div>
<div style={{display:'flex',gap:6}}>
<button onClick={()=>abrirEdicaoOrder(o)} style={{flex:1,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:7,padding:'7px 0',fontSize:12,fontWeight:600,color:TEXT,cursor:'pointer'}}>✏️ Editar</button>
<button onClick={()=>gerarPdf(o)} style={{flex:1,background:'#EFF6FF',border:`1px solid ${ACCENT}33`,borderRadius:7,padding:'7px 0',fontSize:12,fontWeight:600,color:ACCENT,cursor:'pointer'}}>📄 PDF</button>
<button onClick={()=>excluirPedido(o.id)} style={{flex:1,background:'#FEF2F2',border:`1px solid ${DANGER}33`,borderRadius:7,padding:'7px 0',fontSize:12,fontWeight:600,color:DANGER,cursor:'pointer'}}>🗑️ Excluir</button>
</div>
</div>)}
<button onClick={exportarPedidos} disabled={exportLoading} style={{width:'100%',background:exportLoading?MUTED:SUCCESS,color:'#fff',border:'none',borderRadius:10,padding:'14px 0',fontWeight:800,fontSize:15,cursor:exportLoading?'not-allowed':'pointer',marginTop:4}}>
{exportLoading?'Exportando…':'🚀 Exportar para eGestor'}
</button>
</>}
</div>}
{activeTab==='relatorio'&&<div>
<div style={{display:'flex',gap:8,marginBottom:12}}>
<button onClick={()=>setRelatorioTipo('compras')} style={{flex:1,background:relatorioTipo==='compras'?ACCENT:SURFACE,color:relatorioTipo==='compras'?'#fff':MUTED,border:`1px solid ${relatorioTipo==='compras'?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:12,cursor:'pointer'}}>Vendas</button><button onClick={()=>setRelatorioTipo('trocas')} style={{flex:1,background:relatorioTipo==='trocas'?ACCENT:SURFACE,color:relatorioTipo==='trocas'?'#fff':MUTED,border:`1px solid ${relatorioTipo==='trocas'?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:12,cursor:'pointer'}}>Trocas</button>
<button onClick={()=>setRelatorioTipo('ticket')} style={{flex:1,background:relatorioTipo==='ticket'?ACCENT:SURFACE,color:relatorioTipo==='ticket'?'#fff':MUTED,border:`1px solid ${relatorioTipo==='ticket'?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:12,cursor:'pointer'}}>Ticket Médio</button>
</div>
{(()=>{
const view=relatorioTipo
return view==='compras'?<>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📈 Relatório de Vendas por Rota</div>
<select value={relatorioRoute} onChange={e=>setRelatorioRoute(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">Todas as rotas</option>
{routes.map(r=><option key={r} value={r}>{r}</option>)}
</select>
<select value={relatorioVendedorFiltro} onChange={e=>setRelatorioVendedorFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">Todos os vendedores</option>
{trocaVendedoresList.map(v=><option key={v.user_id} value={v.user_id}>{v.name}</option>)}
</select>
<div style={{display:'flex',gap:8,marginBottom:8}}>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DE</label>
<input type="date" value={relatorioInicio} onChange={e=>setRelatorioInicio(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>ATÉ</label>
<input type="date" value={relatorioFim} onChange={e=>setRelatorioFim(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
</div>
<label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer'}}>
<input type="checkbox" checked={relatorioIncluirInativos} onChange={e=>setRelatorioIncluirInativos(e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
<span style={{fontSize:13,color:TEXT,fontWeight:600}}>Incluir clientes inativos</span>
</label>
<button onClick={gerarRelatorio} disabled={relatorioLoading} style={{width:'100%',background:relatorioLoading?MUTED:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:relatorioLoading?'not-allowed':'pointer'}}>
{relatorioLoading?'Gerando…':'📊 Gerar Relatório'}
</button>
{relatorioClientes.length>0&&<button onClick={exportarRelatorioExcel} style={{width:'100%',background:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer',marginTop:8}}>
📥 Exportar para Excel
</button>}
</div>
{relatorioClientes.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'auto'}}>
<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
<thead>
<tr style={{background:SURFACE,borderBottom:`2px solid ${BORDER}`}}>
<th style={{padding:'8px 10px',textAlign:'left',position:'sticky',left:0,background:SURFACE,minWidth:140}}>Cliente</th>
{relatorioMeses.map(m=><th key={m} style={{padding:'8px 10px',textAlign:'right',whiteSpace:'nowrap'}}>{m}</th>)}
<th style={{padding:'8px 10px',textAlign:'right',fontWeight:800}}>Total</th>
</tr>
</thead>
<tbody>
{relatorioClientes.map((c,i)=><tr key={c.id} style={{borderBottom:`1px solid ${BORDER}`,background:c.total===0?'#FEF2F2':i%2===0?CARD:SURFACE}}>
<td style={{padding:'8px 10px',fontWeight:600,position:'sticky',left:0,background:c.total===0?'#FEF2F2':i%2===0?CARD:SURFACE}}>{c.name}{c.inactive?' ⛔':''}</td>
{relatorioMeses.map(m=><td key={m} style={{padding:'8px 10px',textAlign:'right',color:c.totals[m]>0?TEXT:MUTED}}>{c.totals[m]>0?fmt(c.totals[m]):'—'}</td>)}
<td style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:c.total>0?SUCCESS:DANGER}}>{fmt(c.total)}</td>
</tr>)}
<tr style={{background:'#1e293b',color:'#fff'}}>
<td style={{padding:'8px 10px',fontWeight:800,position:'sticky',left:0,background:'#1e293b'}}>TOTAL</td>
{relatorioMeses.map(m=><td key={m} style={{padding:'8px 10px',textAlign:'right',fontWeight:700}}>{fmt(relatorioTotaisPorMes[m]||0)}</td>)}
<td style={{padding:'8px 10px',textAlign:'right',fontWeight:800}}>{fmt(relatorioTotalGeral)}</td>
</tr>
</tbody>
</table>
</div>}
</>:<>
{view!=='ticket'&&<>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔄 Relatório de Trocas</div>
<select value={trocaRoute} onChange={e=>setTrocaRoute(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">{isPrivileged?'Todas as rotas':'Todas as minhas rotas'}</option>
{routes.map(r=><option key={r} value={r}>{r}</option>)}
</select>
{isPrivileged&&<select value={trocaVendedorFiltro} onChange={e=>setTrocaVendedorFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">Todos os vendedores</option>
{trocaVendedoresList.map(v=><option key={v.user_id} value={v.user_id}>{v.name}</option>)}
</select>}
<div style={{display:'flex',gap:8,marginBottom:8}}>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DE</label>
<input type="date" value={trocaInicio} onChange={e=>setTrocaInicio(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>ATÉ</label>
<input type="date" value={trocaFim} onChange={e=>setTrocaFim(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
</div>
<input type="text" placeholder="Filtrar por produto (opcional)" value={trocaProdutoFiltro} onChange={e=>setTrocaProdutoFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',marginBottom:8}}/>
<input type="text" placeholder="Filtrar por cliente (opcional)" value={trocaClienteFiltro} onChange={e=>setTrocaClienteFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',marginBottom:8}}/>
<label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer'}}>
<input type="checkbox" checked={trocaSoProprio} onChange={e=>setTrocaSoProprio(e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
<span style={{fontSize:13,color:TEXT,fontWeight:600}}>Somente fabricação própria</span>
</label>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>AGRUPAR POR</label>
<div style={{display:'flex',gap:8,marginBottom:12}}>
<button onClick={()=>setTrocaAgrupamento('produto')} style={{flex:1,background:trocaAgrupamento==='produto'?ACCENT:SURFACE,color:trocaAgrupamento==='produto'?'#fff':MUTED,border:`1px solid ${trocaAgrupamento==='produto'?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:13,cursor:'pointer'}}>Produto</button>
<button onClick={()=>setTrocaAgrupamento('cliente')} style={{flex:1,background:trocaAgrupamento==='cliente'?ACCENT:SURFACE,color:trocaAgrupamento==='cliente'?'#fff':MUTED,border:`1px solid ${trocaAgrupamento==='cliente'?ACCENT:BORDER}`,borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:13,cursor:'pointer'}}>Cliente</button>
</div>
<button onClick={gerarRelatorioTrocas} disabled={trocaLoading} style={{width:'100%',background:trocaLoading?MUTED:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:trocaLoading?'not-allowed':'pointer'}}>
{trocaLoading?'Gerando…':'📊 Gerar Relatório'}
</button>
{trocaResultado.length>0&&<button onClick={exportarTrocasExcel} style={{width:'100%',background:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer',marginTop:8}}>
📥 Exportar para Excel
</button>}
</div>
{trocaResultado.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'12px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
<span style={{fontWeight:700,fontSize:13}}>Percentual médio de troca</span>
<span style={{fontWeight:800,fontSize:18,color:trocaPercentualMedio>=10?DANGER:trocaPercentualMedio>0?WARNING:SUCCESS}}>{trocaPercentualMedio.toFixed(1)}%</span>
</div>}
{trocaResultado.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'auto'}}>
<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
<thead>
<tr style={{background:SURFACE,borderBottom:`2px solid ${BORDER}`}}>
<th style={{padding:'8px 10px',textAlign:'left'}}>{trocaAgrupamento==='produto'?'Produto':'Cliente'}</th>
<th style={{padding:'8px 10px',textAlign:'right'}}>Qtd Vendida</th>
<th style={{padding:'8px 10px',textAlign:'right'}}>Qtd Trocada</th>
<th style={{padding:'8px 10px',textAlign:'right',fontWeight:800}}>% Troca</th>
</tr>
</thead>
<tbody>
{trocaResultado.map((r,i)=><tr key={r.nome} style={{borderBottom:`1px solid ${BORDER}`,background:r.percentual>=10?'#FEF2F2':i%2===0?CARD:SURFACE}}>
<td style={{padding:'8px 10px',fontWeight:600}}>{r.nome}</td>
<td style={{padding:'8px 10px',textAlign:'right'}}>{r.qtdNormal}</td>
<td style={{padding:'8px 10px',textAlign:'right',color:r.qtdTroca>0?DANGER:MUTED}}>{r.qtdTroca}</td>
<td style={{padding:'8px 10px',textAlign:'right',fontWeight:800,color:r.percentual>=10?DANGER:r.percentual>0?WARNING:SUCCESS}}>{r.percentual.toFixed(1)}%</td>
</tr>)}
</tbody>
</table>
</div>}
</>}
{view==='ticket'&&<>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🎯 Ticket Médio</div>
<select value={ticketRoute} onChange={e=>setTicketRoute(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">{isPrivileged?'Todas as rotas':'Todas as minhas rotas'}</option>
{routes.map(r=><option key={r} value={r}>{r}</option>)}
</select>
{isPrivileged&&<select value={ticketVendedorFiltro} onChange={e=>setTicketVendedorFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">Todos os vendedores</option>
{trocaVendedoresList.map(v=><option key={v.user_id} value={v.user_id}>{v.name}</option>)}
</select>}
<div style={{display:'flex',gap:8,marginBottom:8}}>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DE</label>
<input type="date" value={ticketInicio} onChange={e=>setTicketInicio(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>ATÉ</label>
<input type="date" value={ticketFim} onChange={e=>setTicketFim(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
</div>
<input type="text" placeholder="Filtrar por cliente (opcional)" value={ticketClienteFiltro} onChange={e=>setTicketClienteFiltro(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',marginBottom:8}}/>
<label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer'}}>
<input type="checkbox" checked={ticketSoProprio} onChange={e=>setTicketSoProprio(e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
<span style={{fontSize:13,color:TEXT,fontWeight:600}}>Somente fabricação própria</span>
</label>
<button onClick={gerarTicketMedio} disabled={ticketLoading} style={{width:'100%',background:ticketLoading?MUTED:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:ticketLoading?'not-allowed':'pointer'}}>
{ticketLoading?'Calculando…':'📊 Calcular Ticket Médio'}
</button>
{ticketResultado&&<button onClick={exportarTicketExcel} style={{width:'100%',background:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer',marginTop:8}}>
📥 Exportar para Excel
</button>}
</div>
{ticketResultado&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'20px 16px'}}>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
<div style={{background:SURFACE,borderRadius:10,padding:'12px',textAlign:'center'}}>
<div style={{fontSize:20,fontWeight:800,color:TEXT}}>{fmt(ticketResultado.totalVendido)}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>TOTAL VENDIDO</div>
</div>
<div style={{background:SURFACE,borderRadius:10,padding:'12px',textAlign:'center'}}>
<div style={{fontSize:20,fontWeight:800,color:TEXT}}>{ticketResultado.numClientes}</div>
<div style={{fontSize:11,color:MUTED,fontWeight:600}}>ATENDIMENTOS</div>
</div>
</div>
<div style={{background:ACCENT_LIGHT,borderRadius:10,padding:'16px',textAlign:'center'}}>
<div style={{fontSize:28,fontWeight:800,color:ACCENT}}>{fmt(ticketResultado.ticketMedio)}</div>
<div style={{fontSize:12,color:MUTED,fontWeight:600,marginTop:4}}>TICKET MÉDIO</div>
</div>
</div>}
</>}
</>
})()}
</div>}
{activeTab==='config'&&(usa3?pode('usuarios.ver'):isPrivileged)&&<div>
{usa3?<GestaoUsuarios supabase={supabase} functionsUrl={FUNCTIONS_URL} pode={pode} userId={user?.id} showToast={showToast}/>:isAdmin&&<>
<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:14,marginBottom:12}}>⚙️ Configurações</div>
<button onClick={carregarConfig} disabled={configLoading} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'10px 0',fontWeight:700,fontSize:14,cursor:'pointer',marginBottom:12}}>
{configLoading?'Carregando…':'🔄 Carregar Usuários'}
</button>
<div style={{fontWeight:700,fontSize:13,marginBottom:8}}>➕ Novo Usuário</div>
<input type="text" placeholder="Nome completo" value={novoNome} onChange={e=>setNovoNome(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:8}}/>
<input type="email" placeholder="E-mail" value={novoEmail} onChange={e=>setNovoEmail(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:8}}/>
<input type="password" placeholder="Senha" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:8}}/>
{novoPerfil!=='entregador'&&<select value={novoEgestorCode} onChange={e=>setNovoEgestorCode(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="">Selecionar vendedor eGestor…</option>
{configVendedores.map(v=><option key={v.codigo} value={v.codigo}>{v.nome}</option>)}
</select>}
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>PERFIL</label>
<select value={novoPerfil} onChange={e=>setNovoPerfil(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,background:SURFACE,marginBottom:8}}>
<option value="vendedor">Vendedor</option>
<option value="admin">Administrador</option>
<option value="financeiro">Financeiro</option>
<option value="entregador">Entregador</option>
<option value="outro">Outro…</option>
</select>
{novoPerfil==='outro'&&<input type="text" placeholder="Nome do perfil" value={novoPerfilCustom} onChange={e=>setNovoPerfilCustom(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:14,boxSizing:'border-box',marginBottom:8}}/>}
<button onClick={criarUsuario} disabled={configLoading} style={{width:'100%',background:SUCCESS,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>✅ Criar Usuário</button>
</div>
{configUsuarios.length>0&&<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'14px 16px',marginBottom:12}}>
<div style={{fontWeight:700,fontSize:13,marginBottom:12}}>👥 Usuários Cadastrados</div>
{configUsuarios.map(u=><div key={u.id} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:'12px',marginBottom:8}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
<div>
<div style={{fontWeight:600,fontSize:13}}>{u.config?.name||'Sem nome'}</div>
<div style={{fontSize:11,color:MUTED}}>{u.email}</div>
<div style={{fontSize:11,color:MUTED}}>Vendedor: {configVendedores.find(v=>v.codigo===u.config?.egestor_vendedor_code)?.nome||'Não vinculado'}</div>
<div style={{marginTop:2}}><Badge color={u.config?.perfil==='admin'?DANGER:ACCENT}>{u.config?.perfil||'vendedor'}</Badge></div>
</div>
{(u.id!==ADMIN_ID&&u.id!==user?.id)&&<button onClick={()=>deletarUsuario(u.id)} style={{background:'#FEF2F2',border:`1px solid ${DANGER}33`,borderRadius:7,padding:'6px 10px',fontSize:11,fontWeight:600,color:DANGER,cursor:'pointer'}}>🗑️</button>}
</div>
{(u.id!==ADMIN_ID&&u.id!==user?.id)&&<div style={{marginBottom:8}}>
<div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:6}}>ROTAS DO VENDEDOR</div>
<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
{['AFONSO CLAUDIO','BREJETUBA','DOMINGOS MARTINS','LARANJA DA TERRA','SANTA MARIA','SANTA TERESA','VENDA NOVA'].map(rota=>{const temRota=(u.config?.rotas||[]).includes(rota);return<button key={rota} onClick={async()=>{const novasRotas=temRota?(u.config?.rotas||[]).filter(r=>r!==rota):[...(u.config?.rotas||[]),rota];const{error}=await supabase.from('user_config').update({rotas:novasRotas}).eq('user_id',u.id);if(error){showToast('Erro: '+error.message,'error');return}showToast('Rota atualizada!');await carregarConfig()}} style={{background:temRota?ACCENT:SURFACE,color:temRota?'#fff':MUTED,border:`1px solid ${temRota?ACCENT:BORDER}`,borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer'}}>{rota}</button>})}</div>
</div>}
 {(u.id!==ADMIN_ID&&u.id!==user?.id)&&<div style={{marginBottom:8}}>
<div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:6}}>PERFIL</div>
<select value={['vendedor','admin','financeiro','entregador'].includes(u.config?.perfil)?u.config?.perfil:(u.config?.perfil?'outro':'vendedor')} onChange={async(e)=>{
  if(e.target.value==='outro')return
  const{error}=await supabase.from('user_config').update({perfil:e.target.value}).eq('user_id',u.id)
  if(error){showToast('Erro: '+error.message,'error');return}
  showToast('Perfil atualizado!')
  await carregarConfig()
}} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 10px',fontSize:13,background:SURFACE,marginBottom:6}}>
<option value="vendedor">Vendedor</option>
<option value="admin">Administrador</option>
<option value="financeiro">Financeiro</option>
<option value="entregador">Entregador</option>
<option value="outro">Outro (personalizado)</option>
</select>
{(!['vendedor','admin','financeiro','entregador'].includes(u.config?.perfil))&&<div style={{display:'flex',gap:6}}>
<input type="text" placeholder="Nome do perfil" defaultValue={u.config?.perfil||''} onBlur={async(e)=>{
  const novoValor=e.target.value.trim()
  if(!novoValor||novoValor===u.config?.perfil)return
  const{error}=await supabase.from('user_config').update({perfil:novoValor}).eq('user_id',u.id)
  if(error){showToast('Erro: '+error.message,'error');return}
  showToast('Perfil atualizado!')
  await carregarConfig()
}} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
</div>}
</div>}                                                                                                                   
{(u.id!==ADMIN_ID&&u.id!==user?.id)&&<div style={{display:'flex',gap:8}}>
<input type="password" placeholder="Nova senha…" value={senhaUser[u.id]||''} onChange={e=>setSenhaUser(prev=>({...prev,[u.id]:e.target.value}))} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 10px',fontSize:13,boxSizing:'border-box'}}/>
<button onClick={()=>atualizarSenha(u.id)} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:8,padding:'8px 12px',fontWeight:600,fontSize:12,cursor:'pointer'}}>Alterar</button>
</div>}
</div>)}
</div>}
</>}
<div style={{background:CARD,border:`1px solid ${BORDER}`,padding:'14px 16px'}}>
<div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🔄 Sincronizar Produtos</div>
<div style={{fontSize:12,color:MUTED,marginBottom:12}}>Atualiza todos os produtos do eGestor no CRM.</div>
<button onClick={async()=>{setConfigLoading(true);try{await fetch(`${FUNCTIONS_URL}/sync-produtos`);showToast('Produtos sincronizados!')}catch{showToast('Erro ao sincronizar','error')}setConfigLoading(false)}} disabled={configLoading} style={{width:'100%',background:WARNING,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:'pointer'}}>
📦 Sincronizar Produtos
</button>
</div>
<div style={{background:CARD,border:`1px solid ${BORDER}`,padding:'14px 16px',marginTop:12}}>
<div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🔄 Sincronizar Vendas com eGestor</div>
<div style={{fontSize:12,color:MUTED,marginBottom:12}}>Corrige valores de vendas editadas diretamente no eGestor pelo financeiro.</div>
<div style={{display:'flex',gap:8,marginBottom:12}}>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>DE</label>
<input type="date" value={syncInicio} onChange={e=>setSyncInicio(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
<div style={{flex:1}}>
<label style={{fontSize:11,fontWeight:600,color:MUTED,display:'block',marginBottom:4}}>ATÉ</label>
<input type="date" value={syncFim} onChange={e=>setSyncFim(e.target.value)} style={{width:'100%',border:`1px solid ${BORDER}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box'}}/>
</div>
</div>
<button onClick={async()=>{
  if(!syncInicio||!syncFim){showToast('Selecione o período.','error');return}
  setSyncLoading(true)
  const{atualizadas,total}=await sincronizarVendas(syncInicio,syncFim)
  setSyncLoading(false)
  showToast(`${atualizadas} de ${total} venda(s) atualizada(s)!`)
}} disabled={syncLoading} style={{width:'100%',background:syncLoading?MUTED:WARNING,color:'#fff',border:'none',borderRadius:8,padding:'12px 0',fontWeight:700,fontSize:14,cursor:syncLoading?'not-allowed':'pointer'}}>
{syncLoading?'Sincronizando…':'🔄 Sincronizar Vendas'}
</button>
</div>
</div>}
</div>
</div>)
} 

