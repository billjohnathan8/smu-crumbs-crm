import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { listAmlAlerts, updateAmlAlertReview, triggerAmlScan } from '@/api/aml'
import type { AmlAlert, AmlAlertType, AmlReviewStatus } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import { getSidebarNavForUser } from '@/navigation/sidebarNav'

const ITEMS_PER_PAGE = 20

export function AmlAlertsPage() {
  const { user, logout } = useAuth()
  const [alerts, setAlerts] = useState<AmlAlert[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reviewUpdates, setReviewUpdates] = useState<Record<string, AmlReviewStatus>>({})
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({})
  const [isTriggeringAml, setIsTriggeringAml] = useState(false)
  const [triggerSuccess, setTriggerSuccess] = useState('')

  const [filters, setFilters] = useState<{
    clientId: string
    alertType: '' | AmlAlertType
    reviewStatus: '' | AmlReviewStatus
    detectedDate: string
  }>({
    clientId: '',
    alertType: '',
    reviewStatus: '',
    detectedDate: '',
  })

  const isRootAdmin = isRootAdminUser(user)
  const navItems = useMemo<NavItem[]>(() => getSidebarNavForUser(user), [user])
  const homePath = user?.role === 'user' ? '/user' : '/admin'
  const canTriggerAml = user?.role === 'user' || isRootAdmin

  const fetchAlerts = async (page: number) => {
    setIsLoading(true)
    setError('')
    try {
      const response = await listAmlAlerts({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        clientId: filters.clientId || undefined,
        alertType: filters.alertType || undefined,
        reviewStatus: filters.reviewStatus || undefined,
        detectedDate: filters.detectedDate || undefined,
      })
      setAlerts(response.data)
      setTotal(response.pagination?.total || 0)
      setReviewUpdates(
        response.data.reduce<Record<string, AmlReviewStatus>>((acc, alert) => {
          acc[alert.alertId] = alert.reviewStatus
          return acc
        }, {})
      )
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(
          err.message ||
            (err.status >= 500
              ? 'AML alerts service is not available in this deployment environment.'
              : 'Failed to load AML alerts')
        )
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters])

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value as (typeof prev)[typeof key] }))
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setFilters({ clientId: '', alertType: '', reviewStatus: '', detectedDate: '' })
    setCurrentPage(0)
  }

  const handleUpdateReview = async (alertId: string) => {
    const reviewStatus = reviewUpdates[alertId]
    if (!reviewStatus) return

    setIsUpdating(prev => ({ ...prev, [alertId]: true }))
    setError('')
    try {
      const updated = await updateAmlAlertReview(alertId, { reviewStatus })
      setAlerts(prev =>
        prev.map(alert =>
          alert.alertId === alertId
            ? { ...alert, reviewStatus: updated.reviewStatus, updatedAt: updated.updatedAt }
            : alert
        )
      )
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(err.message || 'Failed to update review status')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsUpdating(prev => ({ ...prev, [alertId]: false }))
    }
  }

  const handleTriggerAmlScan = async () => {
    setIsTriggeringAml(true)
    setError('')
    setTriggerSuccess('')
    try {
      const response = await triggerAmlScan()
      setTriggerSuccess(response.message || 'AML scan triggered successfully')
      // Optionally refresh the alerts list after a delay
      setTimeout(() => {
        fetchAlerts(currentPage)
      }, 2000)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(err.message || 'Failed to trigger AML scan')
      } else {
        setError('An unexpected error occurred while triggering AML scan')
      }
    } finally {
      setIsTriggeringAml(false)
    }
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <SidebarLayout items={navItems}>
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center space-x-4">
          <Link to={homePath} className="text-text-subtle text-2xl">
            Dashboard
          </Link>
          <span className="text-text-subtle text-2xl">/</span>
          <h1 className="text-2xl font-normal text-text">AML Alerts</h1>
        </div>
        {canTriggerAml && (
          <button
            onClick={handleTriggerAmlScan}
            disabled={isTriggeringAml}
            className="px-4 py-2 rounded bg-primary hover:brightness-[0.9] text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTriggeringAml ? 'Triggering...' : 'Trigger AML Scan'}
          </button>
        )}
      </div>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {triggerSuccess && (
          <div className="bg-success/10 border border-success rounded-lg p-4 mb-6">
            <p className="text-success text-sm">{triggerSuccess}</p>
          </div>
        )}

        <div className="bg-card  rounded-lg mb-6 p-4">
          <h3 className="text-text font-normal mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="aml-filter-client-id" className="block text-xs text-text-muted mb-1">
                Client ID
              </label>
              <input
                id="aml-filter-client-id"
                type="text"
                value={filters.clientId}
                onChange={e => setFilter('clientId', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="clt_..."
              />
            </div>
            <div>
              <label htmlFor="aml-filter-alert-type" className="block text-xs text-text-muted mb-1">
                Alert Type
              </label>
              <select
                id="aml-filter-alert-type"
                value={filters.alertType}
                onChange={e => setFilter('alertType', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All</option>
                <option value="STATISTICAL_OUTLIER">Statistical Outlier</option>
                <option value="STRUCTURING">Structuring</option>
                <option value="PASSTHROUGH">Passthrough</option>
                <option value="INCEPTION_SPIKE">Inception Spike</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="aml-filter-review-status"
                className="block text-xs text-text-muted mb-1"
              >
                Review Status
              </label>
              <select
                id="aml-filter-review-status"
                value={filters.reviewStatus}
                onChange={e => setFilter('reviewStatus', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Dismissed">Dismissed</option>
              </select>
            </div>
            <div>
              <label htmlFor="aml-filter-date" className="block text-xs text-text-muted mb-1">
                Detected Date
              </label>
              <input
                id="aml-filter-date"
                type="date"
                value={filters.detectedDate}
                onChange={e => setFilter('detectedDate', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.9] text-sm font-medium transition-all duration-200"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="bg-card  rounded-lg">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-normal text-text">Alert Results</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-6 text-center text-text-subtle">No AML alerts found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Alert ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Client ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Detected
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Review
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {alerts.map(alert => (
                      <tr key={alert.alertId} className="hover:bg-background-light">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono">
                          {alert.alertId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono">
                          {alert.clientId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                          {alert.alertType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                          {new Date(alert.detectedAt).toLocaleString('en-SG')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <select
                              value={reviewUpdates[alert.alertId] ?? alert.reviewStatus}
                              onChange={e =>
                                setReviewUpdates(prev => ({
                                  ...prev,
                                  [alert.alertId]: e.target.value as AmlReviewStatus,
                                }))
                              }
                              className="px-2 py-1 bg-background-light  rounded text-sm"
                            >
                              <option value="Pending">Pending</option>
                              <option value="Confirmed">Confirmed</option>
                              <option value="Dismissed">Dismissed</option>
                            </select>
                            <button
                              onClick={() => handleUpdateReview(alert.alertId)}
                              disabled={isUpdating[alert.alertId]}
                              className="px-2 py-1 text-xs rounded bg-primary hover:brightness-[0.8] text-white disabled:opacity-50 transition-all duration-200"
                            >
                              {isUpdating[alert.alertId] ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-text max-w-xl">
                          {alert.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    Showing {currentPage * ITEMS_PER_PAGE + 1} to{' '}
                    {Math.min((currentPage + 1) * ITEMS_PER_PAGE, total)} of {total} alerts
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 0}
                      className={`px-3 py-1 rounded ${
                        currentPage === 0
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                      }`}
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-text">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className={`px-3 py-1 rounded ${
                        currentPage >= totalPages - 1
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </SidebarLayout>
  )
}
