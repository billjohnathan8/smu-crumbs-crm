import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

type RouteAliasPageProps = {
  fromPath: string
  toPath: string
  destinationLabel: string
}

const AUTO_REDIRECT_DELAY_MS = 1800

export function RouteAliasPage({ fromPath, toPath, destinationLabel }: RouteAliasPageProps) {
  const navigate = useNavigate()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      navigate(toPath, { replace: true, state: { redirectedFrom: fromPath } })
    }, AUTO_REDIRECT_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [fromPath, navigate, toPath])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-card rounded-lg p-8">
          <h1 className="text-2xl font-normal text-text mb-3 text-center">Route Updated</h1>
          <p className="text-text-muted text-center mb-2">
            <span className="font-mono text-text">{fromPath}</span> is now served under
            <span className="font-mono text-text"> {toPath}</span>.
          </p>
          <p className="text-text-subtle text-center mb-6">
            Redirecting to {destinationLabel} now.
          </p>

          <button
            type="button"
            onClick={() => navigate(toPath, { replace: true, state: { redirectedFrom: fromPath } })}
            className="w-full py-3 px-4 rounded-lg font-normal transition-all hover:brightness-[0.8] duration-200 gradient-dark-red text-white"
          >
            Continue to {destinationLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
