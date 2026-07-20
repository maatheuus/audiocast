import { Link, Route, Routes } from "react-router-dom"

import { buttonVariants } from "@/components/ui/button"
import { Highlights } from "@/pages/Highlights"
import { Queue } from "@/pages/Queue"

function App() {
  return (
    <div className="bg-background min-h-svh">
      <div className="mx-auto max-w-3xl px-4 pt-10">
        <header className="mb-8 flex items-start justify-between gap-4 text-left">
          <div>
            <h1 className="text-foreground text-2xl font-semibold">
              Depois Eu Ouço
            </h1>
            <p className="text-muted-foreground text-sm">
              Cole um link do YouTube, baixe o áudio e ouça sem precisar da aba
              aberta.
            </p>
          </div>
          <nav className="flex shrink-0 gap-1">
            <Link
              to="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Fila
            </Link>
            <Link
              to="/highlights"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Destaques
            </Link>
          </nav>
        </header>
      </div>

      <Routes>
        <Route path="/" element={<Queue />} />
        <Route path="/highlights" element={<Highlights />} />
      </Routes>
    </div>
  )
}

export default App
