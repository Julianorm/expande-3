import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Login from './pages/Login'
import { useAuth } from './lib/useAuth'

function Root() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:18, color:'#64748B' }}>
      Carregando…
    </div>
  )

  if (!user) return <Login />

  return <App />
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  componentDidCatch(error) { this.setState({ error: error.message }) }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <h2>Erro encontrado:</h2>
        <pre style={{ background: '#fee', padding: 16, borderRadius: 8, fontSize: 12 }}>{this.state.error}</pre>
      </div>
    )
    return this.props.children
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<React.StrictMode><ErrorBoundary><Root /></ErrorBoundary></React.StrictMode>)
