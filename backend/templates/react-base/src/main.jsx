import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', fontFamily: 'monospace', background: '#1a1a1a', color: '#ff6b6b', minHeight: '100vh' }}>
          <h2 style={{ color: '#fff', marginBottom: '16px' }}>⚠️ App Error</h2>
          <pre style={{ background: '#111', padding: '20px', borderRadius: '8px', overflow: 'auto', fontSize: '13px' }}>
            {this.state.error.toString()}{'\n\n'}{this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
