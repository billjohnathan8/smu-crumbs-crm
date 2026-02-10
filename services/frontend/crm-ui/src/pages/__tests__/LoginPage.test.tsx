import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "../LoginPage";
import { AuthProvider } from "@/features/auth/AuthContext";
import * as authApi from "@/api/auth";
import { ApiError } from "@/api/client";
import type { TokenResponse, User } from "@/api/types";

vi.mock("@/api/auth");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderLoginPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </BrowserRouter>,
  );
};

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockNavigate.mockClear();
    // Mock getCurrentUser to prevent AuthProvider from hanging
    vi.mocked(authApi.getCurrentUser).mockRejectedValue(
      new Error("Not authenticated"),
    );
  });

  it("should render login form", () => {
    renderLoginPage();

    expect(
      screen.getByRole("heading", { name: /CRM Login/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign In/i }),
    ).toBeInTheDocument();
  });

  it("should validate required email field", async () => {
    renderLoginPage();

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    });
  });

  it("should validate email format", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    // Change email to invalid format and blur to finalize state
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.blur(emailInput);

    // Change password to valid value
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.blur(passwordInput);

    // Wait for state to settle
    await waitFor(() => {
      expect(emailInput).toHaveValue("invalid-email");
      expect(passwordInput).toHaveValue("password123");
    });

    // Now submit the form
    fireEvent.click(submitButton);

    // Wait for validation error to appear
    await waitFor(
      () => {
        expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("should validate required password field", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });
  });

  it("should validate password minimum length", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "12345" } });

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Password must be at least 6 characters/i),
      ).toBeInTheDocument();
    });
  });

  it("should clear error when user types in email field", async () => {
    renderLoginPage();

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/Email/i);
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });

    await waitFor(() => {
      expect(screen.queryByText(/Email is required/i)).not.toBeInTheDocument();
    });
  });

  it("should clear error when user types in password field", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    await waitFor(() => {
      expect(
        screen.queryByText(/Password is required/i),
      ).not.toBeInTheDocument();
    });
  });

  it("should successfully login as agent and redirect", async () => {
    const mockTokenResponse: TokenResponse = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    };

    const mockUser: User = {
      id: "user-123",
      firstName: "John",
      lastName: "Doe",
      email: "agent@example.com",
      role: "agent",
      status: "active",
    };

    vi.spyOn(authApi, "login").mockResolvedValue(mockTokenResponse);
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue(mockUser);

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "agent@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/agent", { replace: true });
    });
  });

  it("should successfully login as admin and redirect", async () => {
    const mockTokenResponse: TokenResponse = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    };

    const mockUser: User = {
      id: "admin-123",
      firstName: "Admin",
      lastName: "User",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    };

    vi.spyOn(authApi, "login").mockResolvedValue(mockTokenResponse);
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue(mockUser);

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "admin@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
    });
  });

  it("should show error on 401 Unauthorized", async () => {
    const error = new ApiError(
      401,
      "unauthorized",
      "Invalid email or password",
    );
    vi.spyOn(authApi, "login").mockRejectedValue(error);

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "wrong@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid email or password/i),
      ).toBeInTheDocument();
    });
  });

  it("should show timeout error on 408", async () => {
    const error = new ApiError(408, "request_timeout", "Request timed out");
    vi.spyOn(authApi, "login").mockRejectedValue(error);

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Request timed out. Please check your connection and try again./i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("should show generic error for other API errors", async () => {
    const error = new ApiError(500, "server_error", "Internal server error");
    vi.spyOn(authApi, "login").mockRejectedValue(error);

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Internal server error|Login failed/i),
      ).toBeInTheDocument();
    });
  });

  it("should show generic error for non-API errors", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new Error("Unknown error"));

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/An unexpected error occurred. Please try again./i),
      ).toBeInTheDocument();
    });
  });

  it("should disable form during submission", async () => {
    vi.spyOn(authApi, "login").mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    renderLoginPage();

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(
      /Password/i,
    ) as HTMLInputElement;
    const submitButton = screen.getByRole("button", {
      name: /Sign In/i,
    }) as HTMLButtonElement;

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(screen.getByText(/Signing in.../i)).toBeInTheDocument();
    });
  });

  it("should not submit form with validation errors", async () => {
    const loginSpy = vi.spyOn(authApi, "login");

    renderLoginPage();

    const submitButton = screen.getByRole("button", { name: /Sign In/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
    });

    expect(loginSpy).not.toHaveBeenCalled();
  });
});
