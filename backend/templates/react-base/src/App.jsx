import { BrowserRouter, Routes, Route } from 'react-router-dom'

function Home() {
  return <div className="p-8"><h1 className="text-3xl font-bold">Welcome</h1><p className="text-muted-foreground mt-2">Your app is ready. AI will generate pages here.</p></div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
