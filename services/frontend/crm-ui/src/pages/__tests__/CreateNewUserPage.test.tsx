import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter,Routes, Route, BrowserRouter } from 'react-router-dom'
import { CreateNewUserPage } from '../CreateNewUserPage'
import { AuthProvider } from '@/features/auth/AuthContext'
import * as usersApi from '@/api/users'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'

vi.mock('@/api/users')
vi.mock('@/api/auth')

const mockAdminUser: User = {
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

const mockSuperAdminUser: User = {
  id: 'super-123',
  firstName: 'Super',
  lastName: 'Admin',
  email: 'super@example.com',
  role: 'super_admin',
  status: 'active',
}



const renderCreateNewUserPage = (user: User = mockAdminUser, useStrictRoutes: boolean = false) => {

  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(user))
  if (useStrictRoutes) {
    return render(
      <MemoryRouter initialEntries={['/admin/createnewuser']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/createnewuser" element={<CreateNewUserPage />} />
            <Route path="/unauthorized" element={<h1>Mock Unauthorized Page</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )
  }


  return render(
    <BrowserRouter>
      <AuthProvider>
        <CreateNewUserPage />
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('CreateNewUserPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock getCurrentUser to prevent AuthProvider from hanging
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockAdminUser)
  })

  it('should render create user form for admin', async () => {
    renderCreateNewUserPage()

    await waitFor(() => {
      expect(screen.getByText('Create New User')).toBeInTheDocument()
      expect(screen.getByText('User Details')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument()
    })
  })

  it('should show validation errors for empty required fields', async () => {
    const user = userEvent.setup()
    renderCreateNewUserPage()

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument()
      expect(screen.getByText('Last name is required')).toBeInTheDocument()
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })
  })

  it('should show validation error for invalid email', async () => {
    const user = userEvent.setup()
    renderCreateNewUserPage()

    const firstNameInput = screen.getByLabelText(/First Name/i)
    const lastNameInput = screen.getByLabelText(/Last Name/i)
    const emailInput = screen.getByLabelText(/^Email/i)

    await user.type(firstNameInput, 'John')
    await user.type(lastNameInput, 'Doe')
    await user.type(emailInput, 'invalid-email')

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })
  })

  it('should create user successfully', async () => {
    const user = userEvent.setup()
    vi.spyOn(usersApi, 'createUser').mockResolvedValue({
      id: 'new-user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    })

    renderCreateNewUserPage()

    const firstNameInput = screen.getByLabelText(/First Name/i)
    const lastNameInput = screen.getByLabelText(/Last Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const roleSelect = screen.getByLabelText(/Role/i)

    await user.type(firstNameInput, 'John')
    await user.type(lastNameInput, 'Doe')
    await user.type(emailInput, 'john@example.com')
    await user.selectOptions(roleSelect, 'user')

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(usersApi.createUser).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'user',
        sendInviteEmail: true,
      })
      expect(screen.getByText('User created successfully')).toBeInTheDocument()
    })
  })

  it('should create admin successfully for super admin', async () => {
    const user = userEvent.setup()
    vi.spyOn(usersApi, 'createUser').mockResolvedValue({
      id: 'new-admin-123',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      role: 'admin',
      status: 'active',
    })

    renderCreateNewUserPage(mockSuperAdminUser)

    const firstNameInput = screen.getByLabelText(/First Name/i)
    const lastNameInput = screen.getByLabelText(/Last Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const roleSelect = screen.getByLabelText(/Role/i)

    await user.type(firstNameInput, 'Jane')
    await user.type(lastNameInput, 'Smith')
    await user.type(emailInput, 'jane@example.com')
    await user.selectOptions(roleSelect, 'admin')

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(usersApi.createUser).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'admin',
        sendInviteEmail: true,
      })
      expect(screen.getByText('Admin created successfully')).toBeInTheDocument()
    })
  })

  it('should not allow admin to create admin role', async () => {
    const user = userEvent.setup()
    renderCreateNewUserPage()

    const roleSelect = screen.getByLabelText(/Role/i)
    const options = screen.getAllByRole('option')

    // Should only have 'user' option for regular admin
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveValue('user')
  })

  it('should allow super admin to create both admin and user roles', async () => {
    renderCreateNewUserPage(mockSuperAdminUser)

    const roleSelect = screen.getByLabelText(/Role/i)
    const options = screen.getAllByRole('option')

    expect(options).toHaveLength(2)
    expect(options[0]).toHaveValue('user')
    expect(options[1]).toHaveValue('admin')
  })

  it('should handle duplicate email error', async () => {
    const user = userEvent.setup()
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(new ApiError(409,'User already exists','User already exists'))

    renderCreateNewUserPage()

    const firstNameInput = screen.getByLabelText(/First Name/i)
    const lastNameInput = screen.getByLabelText(/Last Name/i)
    const emailInput = screen.getByLabelText(/Email/i)

    await user.type(firstNameInput, 'John')
    await user.type(lastNameInput, 'Doe')
    await user.type(emailInput, 'existing@example.com')

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('A user with this email already exists')).toBeInTheDocument()
    })
  })

  it('should handle unauthorized error', async () => {
    const user = userEvent.setup()
    const mockLogout = vi.fn()
    vi.spyOn(usersApi, 'createUser').mockRejectedValue(new ApiError(401,'Unauthorized','Unauthorized'))

    // Mock logout in useAuth
    vi.doMock('@/features/auth/AuthContext', () => ({
      useAuth: () => ({
        user: mockAdminUser,
        logout: mockLogout,
      }),
    }))

    renderCreateNewUserPage()

    const firstNameInput = screen.getByLabelText(/First Name/i)
    const lastNameInput = screen.getByLabelText(/Last Name/i)
    const emailInput = screen.getByLabelText(/^Email/i)

    await user.type(firstNameInput, 'John')
    await user.type(lastNameInput, 'Doe')
    await user.type(emailInput, 'john@example.com')

    const submitButton = screen.getByRole('button', { name: /Create User/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should redirect unauthorized users', () => {
    const normalUser: User = {
      id: 'user-123',
      firstName: 'User',
      lastName: 'User',
      email: 'user@example.com',
      role: 'user',
      status: 'active',
    }

    renderCreateNewUserPage(normalUser)

    expect(screen.getByText('/unauthorized')).toBeInTheDocument()
  })

  it('should toggle send invite email checkbox', async () => {
    const user = userEvent.setup()
    renderCreateNewUserPage()

    const checkbox = screen.getByLabelText(/Send invite email/i)
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})
