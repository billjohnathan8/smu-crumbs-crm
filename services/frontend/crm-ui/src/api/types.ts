// Common types
export interface ErrorResponse {
  error: string
  message: string
  requestId?: string
}

export interface Pagination {
  limit: number
  offset: number
  total?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination?: Pagination
}

// Auth types (user-service)
// `user` is the non-admin CRM role (agent in requirement wording).
export type UserRole = 'admin' | 'user' | 'super_admin'
export type UserStatus = 'active' | 'disabled' | 'deleted'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  isRootAdmin?: boolean
  status: UserStatus
  createdAt?: string
  updatedAt?: string
  archivedAt?: string | null
  archivedBy?: string | null
  archivalReason?: string | null
  reinstatedAt?: string | null
  reinstatedBy?: string | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
}

export interface RefreshRequest {
  refreshToken: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  newPassword: string
  confirmPassword: string
}

export interface CreateUserRequest {
  firstName: string
  lastName: string
  email: string
  role: UserRole
  sendInviteEmail?: boolean
  temporaryPassword?: string
}

export interface UpdateUserRequest {
  firstName?: string
  lastName?: string
  email?: string
  role?: UserRole
}

// Client types (client-service)
export type Gender = 'Male' | 'Female' | 'Non-binary' | 'Prefer not to say'
export type IdentityVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type ClientStatus = 'active' | 'inactive' | 'closed'
export type AccountType = 'Savings' | 'Checking' | 'Business'
export type AccountStatus = 'Active' | 'Inactive' | 'Pending'

export interface Client {
  clientId: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Gender
  emailAddress: string
  phoneNumber: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  identityVerificationStatus: IdentityVerificationStatus
  clientStatus: ClientStatus
  primaryDocumentType?: string | null
  primaryDocumentRef?: string | null
  addressDocumentType?: string | null
  addressDocumentRef?: string | null
  verificationVerifiedAt?: string | null
  verificationReviewerNotes?: string | null
  verificationReviewedBy?: string | null
  assignedUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ClientCreateRequest {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Gender
  emailAddress: string
  phoneNumber: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  assignedUserId?: string
}

export interface ClientUpdateRequest {
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  gender?: Gender
  emailAddress?: string
  phoneNumber?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  assignedUserId?: string
}

export interface UploadVerificationDocsRequest {
  verificationToken: string

  // Primary Identity Document
  primaryDocumentType: 'NRIC' | 'PASSPORT' | 'EMPLOYMENT_PASS'
  primaryDocumentRef: string // original filename
  primaryDocumentBase64: string // base64-encoded file content
  primaryDocumentMimeType: string // e.g. "image/jpeg"

  // Proof of Address Document
  addressDocumentType: 'UTILITY_BILL' | 'BANK_STATEMENT' | 'GOVERNMENT_LETTER' | 'TENANCY_AGREEMENT'
  addressDocumentRef: string
  addressDocumentBase64: string
  addressDocumentMimeType: string
}

export interface VerifyClientResponse {
  clientId: string
  identityVerificationStatus: IdentityVerificationStatus
}

export interface VerificationSubmissionSummary {
  pendingSubmissionCount: number
}

export type ReviewAction = 'approve' | 'reject'

export interface ReviewVerificationRequest {
  action: ReviewAction
  reviewerNotes?: string
}

export interface VerificationDocument {
  clientId: string
  documentKind: 'primary' | 'address'
  documentType: string | null
  documentRef: string
  mimeType: string
  documentBase64: string
}

export interface Account {
  accountId: string
  clientId: string
  accountType: AccountType
  accountStatus: AccountStatus
  openingDate: string
  initialDeposit: number
  currency: string
  branchId: string
  createdAt?: string
  updatedAt?: string
}

export interface AccountCreateRequest {
  clientId: string
  accountType: AccountType
  accountStatus: AccountStatus
  openingDate?: string
  initialDeposit: number
  currency: string
  branchId: string
}

export interface AccountUpdateRequest {
  accountType?: AccountType
  accountStatus?: AccountStatus
  branchId?: string
}

export interface AccountOpeningOptions {
  clientId: string
  defaultBranchId: string
  canOverrideBranch: boolean
  authorizedBranches: string[]
  allowedCurrencies: string[]
  branchAllowedCurrencies: Record<string, string[]>
  accountTypeAllowedCurrencies: Partial<Record<AccountType, string[]>>
}

// Transaction types (transaction-service)
export type TransactionKind = 'D' | 'W'
export type TransactionStatus = 'Completed' | 'Pending' | 'Failed'
export type ImportBatchStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Transaction {
  id: string
  clientId: string
  transaction: TransactionKind
  amount: number
  date: string
  status: TransactionStatus
  importedAt?: string
  importBatchId?: string
}

export interface CreateTransactionRequest {
  clientId: string
  transaction: TransactionKind
  amount: number
  date: string
  status: TransactionStatus
}

export interface UpdateTransactionRequest {
  clientId?: string
  transaction?: TransactionKind
  amount?: number
  date?: string
  status?: TransactionStatus
}

export interface ImportTransactionsRequest {
  clientId?: string
  sourcePath?: string
}

export interface ImportBatch {
  importBatchId: string
  status: ImportBatchStatus
  requestedClientId?: string | null
  requestedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  totalRecords: number
  importedRecords: number
  failedRecords: number
  errorMessage?: string | null
}

// Log types (log-service)
export type LogAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'COMMUNICATION'

export interface LogEntry {
  logId: string
  action: LogAction
  attributeName: string
  beforeValue?: string | null
  afterValue?: string | null
  userId: string
  clientId: string
  dateTime: string
  correlationId?: string | null
}

export interface CreateLogRequest {
  action: LogAction
  attributeName: string
  beforeValue?: string | null
  afterValue?: string | null
  userId: string
  clientId: string
  dateTime?: string
  correlationId?: string | null
}

export type CommunicationChannel = 'email'
export type CommunicationStatus = 'queued' | 'sent' | 'failed'

export interface Communication {
  communicationId: string
  clientId: string
  userId: string
  channel: CommunicationChannel
  toEmail: string
  subject: string
  body: string
  status: CommunicationStatus
  providerMessageId?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateCommunicationStatusRequest {
  status?: CommunicationStatus
  providerMessageId?: string | null
  errorMessage?: string | null
  retryCount?: number | null
  nextAttemptAt?: string | null
  lastAttemptAt?: string | null
  deliveryEvent?: string | null
}

// AML alert types (log-service AML endpoints)
export type AmlAlertType = 'STATISTICAL_OUTLIER' | 'STRUCTURING' | 'PASSTHROUGH' | 'INCEPTION_SPIKE'
export type AmlReviewStatus = 'Pending' | 'Confirmed' | 'Dismissed'

export interface AmlAlert {
  alertId: string
  clientId: string
  transactionId?: string | null
  alertType: AmlAlertType
  description: string
  detectedAt: string
  reviewStatus: AmlReviewStatus
  createdAt: string
  updatedAt: string
}

export interface CreateAmlAlertRequest {
  alertId: string
  clientId: string
  transactionId?: string | null
  alertType: AmlAlertType
  description: string
  detectedAt: string
  reviewStatus?: AmlReviewStatus
}

export interface UpdateAmlAlertReviewRequest {
  reviewStatus: AmlReviewStatus
}
