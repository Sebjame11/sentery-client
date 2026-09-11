import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/dueDiligence.css'
import 'flag-icons/css/flag-icons.min.css'
import App from './App.jsx'
import { AuthProvider } from './store/AuthContext'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>,
)
