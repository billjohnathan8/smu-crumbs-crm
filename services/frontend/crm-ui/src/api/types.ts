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

// Auth types (agent-service)
export type UserRole = 'admin' | 'agent' | 'super_admin'
export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt?: string
  updatedAt?: string
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
  assignedAgentId?: string
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
}

export interface VerifyClientRequest {
  nric: string
  documentType?: 'NRIC'
  documentRef?: string
}

export interface VerifyClientResponse {
  clientId: string
  identityVerificationStatus: IdentityVerificationStatus
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
  openingDate: string
  initialDeposit: number
  currency: string
  branchId: string
}

// Transaction types (transaction-service)
export type TransactionKind = 'D' | 'W'
export type TransactionStatus = 'Completed' | 'Pending' | 'Failed'

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

// Log types (log-service)
export type LogAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'COMMUNICATION'

export interface LogEntry {
  logId: string
  action: LogAction
  attributeName: string
  beforeValue?: string | null
  afterValue?: string | null
  agentId: string
  clientId: string
  dateTime: string
  correlationId?: string | null
}

export interface CreateLogRequest {
  action: LogAction
  attributeName: string
  beforeValue?: string | null
  afterValue?: string | null
  agentId: string
  clientId: string
  dateTime?: string
  correlationId?: string | null
}

export type CommunicationChannel = 'email'
export type CommunicationStatus = 'queued' | 'sent' | 'failed'

export interface Communication {
  communicationId: string
  clientId: string
  agentId: string
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
