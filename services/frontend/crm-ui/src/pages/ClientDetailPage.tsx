// import { useState, useEffect, type FormEvent } from 'react'
// import { useParams, useNavigate, useLocation } from 'react-router-dom'
// import { useAuth } from '@/features/auth/AuthContext'
// import {
//   getClientById,
//   verifyClient,
//   reviewVerification,
//   deleteClient,
//   listClientAccounts,
// } from '@/api/clients'
// import { listClientTransactions } from '@/api/transactions'
// import { listClientCommunications, sendCommunication } from '@/api/communications'
// import type {
//   Client,
//   Transaction,
//   VerifyClientRequest,
//   Account,
//   Communication,
//   ReviewAction,
// } from '@/api/types'
// import type { SendCommunicationRequest } from '@/api/communications'
// import { ApiError } from '@/api/client'
// import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
// import { ClientDetail } from '@/components/ClientDetail'
// import { VerificationForm } from '@/components/VerificationForm'
// import { VerificationReviewPanel } from '@/components/VerificationReviewPanel'
// import { RecentTransactionsTable } from '@/components/RecentTransactionsTable'
// import { BankAccountsPreview } from '@/components/BankAccountsPreview'
// import { CommunicationsPanel } from '@/components/CommunicationsPanel'
// import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'

// const userNav: NavItem[] = [
//   { label: 'Home', to: '/user', end: true },
//   { label: 'My Clients', to: '/user/clients' },
//   { label: 'Create Client', to: '/user/clients/new' },
//   { label: 'Transactions', to: '/user/transactions' },
//   { label: 'AML Alerts', to: '/user/aml-alerts' },
//   { label: 'Settings', to: '/user/settings' },
// ]

// const adminNav: NavItem[] = [
//   { label: 'Home', to: '/admin', end: true },
//   { label: 'All Clients', to: '/admin/clients', end: true },
//   { label: 'Create Client', to: '/admin/clients/new' },
//   { label: 'Communications', to: '/admin/communications' },
//   { label: 'Transactions', to: '/admin/transactions' },
//   { label: 'AML Alerts', to: '/admin/aml-alerts' },
//   { label: 'User Management', to: '/admin/users' },
//   { label: 'Settings', to: '/admin/settings' },
// ]

// const statusColors: Record<string, string> = {
//   unverified: 'bg-background-light text-text-muted',
//   pending: 'bg-warning/20 text-warning',
//   verified: 'bg-success/20 text-success',
//   rejected: 'bg-danger/20 text-danger',
// }

export function ClientDetailPage() {
  //   const { clientId } = useParams<{ clientId: string }>()
  //   const { user, logout } = useAuth()
  //   const navigate = useNavigate()
  //   const location = useLocation()
  //   const isUser = user?.role === 'user'
  //   const isAdmin = user?.role === 'admin'
  //   const isSuperAdmin = user?.role === 'super_admin'
  //   const isManagementUser = isAdmin || isSuperAdmin
  //   const canViewAllClients = isManagementUser
  //   const canReviewVerification = isManagementUser
  //   const canDeleteClient = isUser || isManagementUser
  //   const canEditClient = isUser || isManagementUser
  //   const canVerifyClient = isUser || isManagementUser
  //   const canSendCommunication = isUser || isManagementUser
  //   const sidebarNav: NavItem[] = isManagementUser
  //     ? [
  //         ...adminNav,
  //         ...(isSuperAdmin ? [{ label: 'Admin Management', to: '/admin/admins' as const }] : []),
  //       ]
  //     : userNav
  //   const basePath = isManagementUser ? '/admin' : '/user'
  //   const clientsListPath = `${basePath}/clients`
  //   const [client, setClient] = useState<Client | null>(null)
  //   const [transactions, setTransactions] = useState<Transaction[]>([])
  //   const [accounts, setAccounts] = useState<Account[]>([])
  //   const [communications, setCommunications] = useState<Communication[]>([])
  //   const [isLoading, setIsLoading] = useState(true)
  //   const [error, setError] = useState<string>('')
  //   const navSuccessMessage =
  //     (location.state as { successMessage?: string } | null)?.successMessage || ''
  //   const [showVerifyForm, setShowVerifyForm] = useState(false)
  //   const [verifyData, setVerifyData] = useState<VerifyClientRequest>({
  //     nric: '',
  //     documentType: 'NRIC',
  //     documentRef: '',
  //   })
  //   const [verifyError, setVerifyError] = useState<string>('')
  //   const [isVerifying, setIsVerifying] = useState(false)
  //   const [verifySuccess, setVerifySuccess] = useState<string>(navSuccessMessage)
  //   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  //   const [isDeleting, setIsDeleting] = useState(false)
  //   const [deleteError, setDeleteError] = useState('')
  //   const [showComposeForm, setShowComposeForm] = useState(false)
  //   const [composeData, setComposeData] = useState<
  //     Omit<SendCommunicationRequest, 'clientId' | 'channel'>
  //   >({
  //     toEmail: '',
  //     subject: '',
  //     body: '',
  //   })
  //   const [composeError, setComposeError] = useState('')
  //   const [isSending, setIsSending] = useState(false)
  //   const [composeSuccess, setComposeSuccess] = useState('')
  //   const [isReviewing, setIsReviewing] = useState(false)
  //   const [reviewError, setReviewError] = useState('')
  //   const loadClientData = async () => {
  //     if (!clientId) return
  //     setIsLoading(true)
  //     setError('')
  //     try {
  //       const [clientData, txResponse, accountsData, commsResponse] = await Promise.all([
  //         getClientById(clientId),
  //         listClientTransactions(clientId, { limit: 10 }),
  //         listClientAccounts(clientId).catch(() => [] as Account[]),
  //         listClientCommunications(clientId, { limit: 10 }).catch(() => ({
  //           data: [] as Communication[],
  //         })),
  //       ])
  //       setClient(clientData)
  //       setTransactions(txResponse.data)
  //       setAccounts(accountsData)
  //       setCommunications(commsResponse.data)
  //     } catch (err) {
  //       if (err instanceof ApiError) {
  //         if (err.status === 401) {
  //           logout()
  //         } else if (err.status === 403) {
  //           setError(
  //             isUser
  //               ? 'You are not allowed to access this client.'
  //               : 'You are not allowed to access this client record.'
  //           )
  //         } else if (err.status === 404) {
  //           setError('Client not found')
  //         } else {
  //           setError(err.message || 'Failed to load client')
  //         }
  //       } else {
  //         setError('An unexpected error occurred')
  //       }
  //     } finally {
  //       setIsLoading(false)
  //     }
  //   }
  //   useEffect(() => {
  //     loadClientData()
  //     // eslint-disable-next-line react-hooks/exhaustive-deps
  //   }, [clientId])
  //   const handleReviewVerification = async (action: ReviewAction) => {
  //     if (!clientId || !canReviewVerification) return
  //     setIsReviewing(true)
  //     setReviewError('')
  //     setVerifySuccess('')
  //     try {
  //       const result = await reviewVerification(clientId, { action })
  //       setVerifySuccess(
  //         action === 'approve'
  //           ? `Verification approved (status: ${result.identityVerificationStatus})`
  //           : `Verification rejected (status: ${result.identityVerificationStatus})`
  //       )
  //       const updated = await getClientById(clientId)
  //       setClient(updated)
  //     } catch (err) {
  //       if (err instanceof ApiError) {
  //         if (err.status === 401) logout()
  //         else if (err.status === 403) setReviewError('You are not allowed to review verification.')
  //         else setReviewError(err.message || 'Review failed')
  //       } else {
  //         setReviewError('An unexpected error occurred')
  //       }
  //     } finally {
  //       setIsReviewing(false)
  //     }
  //   }
  //   const handleVerify = async (e: FormEvent) => {
  //     e.preventDefault()
  //     if (!clientId || !canVerifyClient) return
  //     if (!verifyData.nric.trim()) {
  //       setVerifyError('NRIC is required')
  //       return
  //     }
  //     setIsVerifying(true)
  //     setVerifyError('')
  //     setVerifySuccess('')
  //     try {
  //       const result = await verifyClient(clientId, verifyData)
  //       setVerifySuccess(
  //         `Verification submitted for review (status: ${result.identityVerificationStatus})`
  //       )
  //       setShowVerifyForm(false)
  //       const updated = await getClientById(clientId)
  //       setClient(updated)
  //     } catch (err) {
  //       if (err instanceof ApiError) {
  //         if (err.status === 401) logout()
  //         else if (err.status === 403) setVerifyError('You are not allowed to verify this client.')
  //         else setVerifyError(err.message || 'Verification failed')
  //       } else {
  //         setVerifyError('An unexpected error occurred')
  //       }
  //     } finally {
  //       setIsVerifying(false)
  //     }
  //   }
  //   const handleDeleteClient = async () => {
  //     if (!clientId || !canDeleteClient) return
  //     setIsDeleting(true)
  //     setDeleteError('')
  //     try {
  //       await deleteClient(clientId)
  //       navigate(clientsListPath, {
  //         replace: true,
  //         state: { successMessage: `Client ${client?.firstName} ${client?.lastName} deleted` },
  //       })
  //     } catch (err) {
  //       if (err instanceof ApiError) {
  //         if (err.status === 401) logout()
  //         else if (err.status === 403) setDeleteError('You are not allowed to delete this client.')
  //         else setDeleteError(err.message || 'Failed to delete client')
  //       } else {
  //         setDeleteError('An unexpected error occurred')
  //       }
  //     } finally {
  //       setIsDeleting(false)
  //     }
  //   }
  //   const handleSendCommunication = async (e: FormEvent) => {
  //     e.preventDefault()
  //     if (!clientId || !canSendCommunication) return
  //     if (!composeData.toEmail.trim() || !composeData.subject.trim() || !composeData.body.trim()) {
  //       setComposeError('All fields are required')
  //       return
  //     }
  //     setIsSending(true)
  //     setComposeError('')
  //     setComposeSuccess('')
  //     try {
  //       await sendCommunication({
  //         clientId,
  //         channel: 'email',
  //         toEmail: composeData.toEmail,
  //         subject: composeData.subject,
  //         body: composeData.body,
  //       })
  //       setComposeSuccess('Email queued successfully')
  //       setShowComposeForm(false)
  //       setComposeData({ toEmail: '', subject: '', body: '' })
  //       const commsResponse = await listClientCommunications(clientId, { limit: 10 })
  //       setCommunications(commsResponse.data)
  //     } catch (err) {
  //       if (err instanceof ApiError) {
  //         if (err.status === 401) logout()
  //         else if (err.status === 403) setComposeError('You are not allowed to send communications.')
  //         else setComposeError(err.message || 'Failed to send email')
  //       } else {
  //         setComposeError('An unexpected error occurred')
  //       }
  //     } finally {
  //       setIsSending(false)
  //     }
  //   }
  //   const formatDate = (dateStr?: string) => {
  //     if (!dateStr) return '-'
  //     return new Date(dateStr).toLocaleDateString('en-SG', {
  //       year: 'numeric',
  //       month: 'short',
  //       day: 'numeric',
  //     })
  //   }
  //   const formatAmount = (amount: number) =>
  //     new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(amount)
  //   if (isLoading) {
  //     return (
  //       <SidebarLayout items={sidebarNav}>
  //         <div className="flex h-64 items-center justify-center">
  //           <div
  //             data-testid="loading-spinner"
  //             className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary"
  //           />
  //         </div>
  //       </SidebarLayout>
  //     )
  //   }
  //   if (error || !client) {
  //     return (
  //       <SidebarLayout items={sidebarNav}>
  //         <div className="mt-6 rounded-lg border border-danger bg-danger/10 p-4">
  //           <p className="text-danger">{error || 'Client not found'}</p>
  //         </div>
  //         <button
  //           onClick={() => navigate(clientsListPath)}
  //           className="mt-4 rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover"
  //         >
  //           Back to Clients
  //         </button>
  //       </SidebarLayout>
  //     )
  //   }
  //   return (
  //     <SidebarLayout items={sidebarNav}>
  //       <nav>
  //         <div className="flex h-16 items-center justify-between px-4">
  //           <div className="flex items-center space-x-4">
  //             <button
  //               onClick={() => navigate(clientsListPath)}
  //               className="text-sm text-text-muted hover:text-text"
  //             >
  //               ← {canViewAllClients ? 'All Clients' : 'My Clients'}
  //             </button>
  //             <span className="text-text-muted">/</span>
  //             <h1 className="text-2xl font-normal text-text">
  //               {client.firstName} {client.lastName}
  //             </h1>
  //             <span
  //               className={`rounded px-2 py-1 text-xs font-normal ${
  //                 statusColors[client.identityVerificationStatus] ??
  //                 'bg-background-light text-text-muted'
  //               }`}
  //             >
  //               {client.identityVerificationStatus}
  //             </span>
  //           </div>
  //         </div>
  //       </nav>
  //       <main className="mt-6 space-y-6">
  //         {verifySuccess && (
  //           <div className="rounded-lg border border-success bg-success/10 p-4">
  //             <p className="text-sm text-success">{verifySuccess}</p>
  //           </div>
  //         )}
  //         <ClientDetail
  //           client={client}
  //           formatDate={formatDate}
  //           onEdit={
  //             canEditClient ? () => navigate(`${basePath}/clients/${clientId}/edit`) : undefined
  //           }
  //           onDelete={canDeleteClient ? () => setShowDeleteConfirm(true) : undefined}
  //           onToggleVerify={canVerifyClient ? () => setShowVerifyForm(v => !v) : undefined}
  //           showVerifyButton={canVerifyClient && client.identityVerificationStatus === 'unverified'}
  //           showVerifyForm={showVerifyForm}
  //         />
  //         {showVerifyForm && canVerifyClient && (
  //           <VerificationForm
  //             verifyData={verifyData}
  //             setVerifyData={setVerifyData}
  //             verifyError={verifyError}
  //             isVerifying={isVerifying}
  //             onSubmit={handleVerify}
  //             onCancel={() => setShowVerifyForm(false)}
  //           />
  //         )}
  //         {canReviewVerification && client.identityVerificationStatus === 'pending' && (
  //           <VerificationReviewPanel
  //             reviewError={reviewError}
  //             isReviewing={isReviewing}
  //             onApprove={() => handleReviewVerification('approve')}
  //             onReject={() => handleReviewVerification('reject')}
  //           />
  //         )}
  //         <RecentTransactionsTable
  //           transactions={transactions}
  //           formatAmount={formatAmount}
  //           onViewAll={() => navigate(`${basePath}/transactions?clientId=${client.clientId}`)}
  //         />
  //         <BankAccountsPreview
  //           accounts={accounts}
  //           formatAmount={formatAmount}
  //           onManageAccounts={() => navigate(`${basePath}/clients/${client.clientId}/accounts`)}
  //         />
  //         <CommunicationsPanel
  //           communications={communications}
  //           composeSuccess={composeSuccess}
  //           composeError={composeError}
  //           showComposeForm={showComposeForm}
  //           setShowComposeForm={canSendCommunication ? setShowComposeForm : () => {}}
  //           composeData={composeData}
  //           setComposeData={setComposeData}
  //           isSending={isSending}
  //           onSubmit={handleSendCommunication}
  //           defaultEmail={client.emailAddress}
  //           formatDate={formatDate}
  //         />
  //         {showDeleteConfirm && canDeleteClient && (
  //           <DeleteConfirmModal
  //             title="Delete Client"
  //             message={`Are you sure you want to delete ${client.firstName} ${client.lastName}? This action cannot be undone.`}
  //             error={deleteError}
  //             isLoading={isDeleting}
  //             onCancel={() => {
  //               setShowDeleteConfirm(false)
  //               setDeleteError('')
  //             }}
  //             onConfirm={handleDeleteClient}
  //             testId="delete-client-modal"
  //           />
  //         )}
  //       </main>
  //     </SidebarLayout>
  //   )
}
