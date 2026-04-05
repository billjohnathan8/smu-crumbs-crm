import { useNavigate } from 'react-router-dom'

export function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg p-8">
          <h1 className="text-3xl font-normal text-danger mb-2 text-center">Access Denied</h1>
          <p className="text-text-muted text-center mb-6">
            You do not have permission to access this page.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="w-full py-3 px-4 rounded-lg font-normal transition-all hover:brightness-[0.8] duration-200 gradient-dark-red text-white"
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full py-3 px-4 rounded-lg font-normal transition-colors bg-background-light hover:bg-background-lighter text-text border border-border"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
