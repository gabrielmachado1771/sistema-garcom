import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './App.css'
import { registrarServiceWorker } from './utils/instalar.js'
import { aplicarTema } from './utils/tema.js'

aplicarTema()
registrarServiceWorker()

// Link bonito da Vercel (/r/sobradinho) vira a rota interna (#/r/sobradinho).
const linkRestaurante = window.location.pathname.match(/\/r\/([a-z0-9-]+)\/?$/i)
if (linkRestaurante && !window.location.hash) {
  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}#/r/${linkRestaurante[1].toLowerCase()}`)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
