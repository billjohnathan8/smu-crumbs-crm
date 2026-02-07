/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AdminManageAccounts } from '../AdminManageAccounts'
import { AuthProvider } from '@/features/auth/AuthContext'
import * as usersApi from '@/api/users'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'

vi.mock('@/api/users')
vi.mock('@/api/auth')

const mockAdmin: User = {
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

const renderAdminManageAccounts = () => {
  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(mockAdmin))

  return render(
    <BrowserRouter>
      <AuthProvider>
        <AdminManageAccounts />
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('AdminManageAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock window.confirm
    globalThis.confirm = vi.fn(() => true) as any
    // Mock getCurrentUser to prevent AuthProvider from hanging
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockAdmin)
  })

  it('should render page header', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Manage Accounts/i })).toBeInTheDocument()
    })
  })

  it('should display users in table', async () => {
    const mockUsers: User[] = [
      {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'agent',
        status: 'active',
      },
      {
        id: 'user-2',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'admin',
        status: 'active',
      },
    ]

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: mockUsers,
      pagination: { total: 2, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    })
  })

  it('should show loading state', async () => {
    vi.spyOn(usersApi, 'listUsers').mockImplementation(() => new Promise(() => {}))

    renderAdminManageAccounts()

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('should show error when loading users fails', async () => {
    const error = new ApiError(500, 'server_error', 'Failed to load users')
    vi.spyOn(usersApi, 'listUsers').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load users/i)).toBeInTheDocument()
    })
  })

  it('should open create user modal', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    expect(screen.getByRole('heading', { name: /Create New User/i })).toBeInTheDocument()
  })

  it('should validate form fields when creating user', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/First name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/Last name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument()
    })
  })

  it('should validate email format', async () => {
    vi.spyOn(usersApi, 'listUsers')
      .mockReset()
      .mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    const emailInput = screen.getByLabelText(/^Email$/i)
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument()
    })
  })

  it('should create user successfully', async () => {
    const mockNewUser: User = {
      id: 'user-new',
      firstName: 'New',
      lastName: 'Agent',
      email: 'new@example.com',
      role: 'agent',
      status: 'active',
    }

    const listUsersSpy = vi.spyOn(usersApi, 'listUsers')
    listUsersSpy.mockReset()
    listUsersSpy
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: [mockNewUser],
        pagination: { total: 1, limit: 10, offset: 0 },
      })

    vi.spyOn(usersApi, 'createUser').mockResolvedValue(mockNewUser)

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(usersApi.createUser).toHaveBeenCalledWith({
        firstName: 'New',
        lastName: 'Agent',
        email: 'new@example.com',
        role: 'agent',
        sendInviteEmail: true,
      })
      expect(screen.getByText(/User created successfully/i)).toBeInTheDocument()
    })
  })

  it('should disable user', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    const disabledUser: User = { ...mockUser, status: 'disabled' }

    const listUsersSpy = vi.spyOn(usersApi, 'listUsers')
    listUsersSpy.mockReset()
    listUsersSpy
      .mockResolvedValueOnce({
        data: [mockUser],
        pagination: { total: 1, limit: 10, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: [disabledUser],
        pagination: { total: 1, limit: 10, offset: 0 },
      })

    vi.spyOn(usersApi, 'disableUser').mockResolvedValue(disabledUser)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const disableButtons = screen.getAllByRole('button', { name: /Disable/i })
    fireEvent.click(disableButtons[0])

    await waitFor(() => {
      expect(usersApi.disableUser).toHaveBeenCalledWith('user-1')
      expect(screen.getByText(/User disabled successfully/i)).toBeInTheDocument()
    })
  })

  it('should delete user', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers')
      .mockResolvedValueOnce({
        data: [mockUser],
        pagination: { total: 1, limit: 10, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

    vi.spyOn(usersApi, 'deleteUser').mockResolvedValue(undefined)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(usersApi.deleteUser).toHaveBeenCalledWith('user-1')
      expect(screen.getByText(/User deleted successfully/i)).toBeInTheDocument()
    })
  })

  it('should send password reset email', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    vi.spyOn(usersApi, 'resetUserPassword').mockResolvedValue(undefined)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const resetButtons = screen.getAllByRole('button', { name: /Reset Password/i })
    fireEvent.click(resetButtons[0])

    await waitFor(() => {
      expect(usersApi.resetUserPassword).toHaveBeenCalledWith('user-1', 'john@example.com')
      expect(screen.getByText(/Password reset email sent/i)).toBeInTheDocument()
    })
  })

  it('should navigate through pages', async () => {
    const mockUsers = Array.from({ length: 15 }, (_, i) => ({
      id: `user-${i}`,
      firstName: `User${i}`,
      lastName: `Test${i}`,
      email: `user${i}@example.com`,
      role: 'agent' as const,
      status: 'active' as const,
    }))

    const listUsersSpy = vi.spyOn(usersApi, 'listUsers')
    listUsersSpy.mockReset()
    listUsersSpy
      .mockResolvedValueOnce({
        data: mockUsers.slice(0, 10),
        pagination: { total: 15, limit: 10, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: mockUsers.slice(10, 15),
        pagination: { total: 15, limit: 10, offset: 10 },
      })

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('User0 Test0')).toBeInTheDocument()
    })

    const nextButton = screen.getByRole('button', { name: /Next/i })
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText('User10 Test10')).toBeInTheDocument()
    })
  })

  it('should not submit form if user cancels confirmation', async () => {
    globalThis.confirm = vi.fn(() => false) as any

    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    // Clear and reset the mock to ensure clean state
    const listUsersSpy = vi.spyOn(usersApi, 'listUsers')
    listUsersSpy.mockReset()
    listUsersSpy.mockResolvedValue({
      data: [mockUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    const disableSpy = vi.spyOn(usersApi, 'disableUser')

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const disableButtons = screen.getAllByRole('button', { name: /Disable/i })
    fireEvent.click(disableButtons[0])

    expect(disableSpy).not.toHaveBeenCalled()
  })

  it('should handle 401 error when creating user', async () => {
    const mockLogout = vi.fn()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      ...mockAdmin,
      logout: mockLogout,
    } as any)

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    const error = new ApiError(401, 'unauthorized', 'Unauthorized')
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(usersApi.createUser).toHaveBeenCalled()
    })
  })

  it('should handle 409 error when creating user', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    const error = new ApiError(409, 'conflict', 'User already exists')
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/User already exists/i)).toBeInTheDocument()
    })
  })

  it('should handle generic error when creating user', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    const error = new ApiError(500, 'server_error', 'Internal server error')
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/Internal server error/i)).toBeInTheDocument()
    })
  })

  it('should handle non-ApiError when creating user', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    const error = new Error('Network error')
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument()
    })
  })

  it('should handle error when disabling user', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    const error = new ApiError(500, 'server_error', 'Failed to disable')
    vi.spyOn(usersApi, 'disableUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const disableButtons = screen.getAllByRole('button', { name: /Disable/i })
    fireEvent.click(disableButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/Failed to disable/i)).toBeInTheDocument()
    })
  })

  it('should handle error when deleting user', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    const error = new ApiError(500, 'server_error', 'Failed to delete')
    vi.spyOn(usersApi, 'deleteUser').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete/i)).toBeInTheDocument()
    })
  })

  it('should handle error when resetting password', async () => {
    const mockUser: User = {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    const error = new ApiError(500, 'server_error', 'Failed to reset password')
    vi.spyOn(usersApi, 'resetUserPassword').mockRejectedValue(error)

    renderAdminManageAccounts()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    const resetButtons = screen.getAllByRole('button', { name: /Reset Password/i })
    fireEvent.click(resetButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/Failed to reset password/i)).toBeInTheDocument()
    })
  })

  it('should close modal when clicking cancel', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    expect(screen.getByRole('heading', { name: /Create New User/i })).toBeInTheDocument()

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Create New User/i })).not.toBeInTheDocument()
    })
  })

  it('should clear field errors when typing in create user form', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminManageAccounts()

    await waitFor(() => {
      const createButton = screen.getByRole('button', { name: /Create New Agent/i })
      fireEvent.click(createButton)
    })

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/First name is required/i)).toBeInTheDocument()
    })

    const firstNameInput = screen.getByLabelText(/First Name/i)
    fireEvent.change(firstNameInput, { target: { value: 'John' } })

    await waitFor(() => {
      expect(screen.queryByText(/First name is required/i)).not.toBeInTheDocument()
    })
  })
})
