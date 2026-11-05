import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Applies the remembered theme (data-theme on <html>) before the first render
import './theme/theme.js'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
