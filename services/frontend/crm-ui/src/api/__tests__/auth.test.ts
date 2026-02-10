import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, refreshToken, getCurrentUser } from "../auth";
import * as client from "../client";
import { ApiError } from "../client";
import type { LoginRequest, TokenResponse, User } from "../types";

describe("auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("should call apiPost with correct endpoint and credentials", async () => {
      const credentials: LoginRequest = {
        email: "test@example.com",
        password: "password123",
      };

      const mockResponse: TokenResponse = {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue(mockResponse);

      const result = await login(credentials);

      expect(client.apiPost).toHaveBeenCalledWith(
        "/api/auth/login",
        credentials,
        {
          skipAuth: true,
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should skip auth when calling login", async () => {
      const credentials: LoginRequest = {
        email: "test@example.com",
        password: "password123",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      await login(credentials);

      expect(client.apiPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ skipAuth: true }),
      );
    });

    it("should handle login errors", async () => {
      const credentials: LoginRequest = {
        email: "wrong@example.com",
        password: "wrongpass",
      };

      const error = new ApiError(401, "unauthorized", "Invalid credentials");
      vi.spyOn(client, "apiPost").mockRejectedValue(error);

      await expect(login(credentials)).rejects.toThrow(ApiError);
      await expect(login(credentials)).rejects.toThrow("Invalid credentials");
    });
  });

  describe("refreshToken", () => {
    it("should call apiPost with refresh token", async () => {
      const mockRefreshToken = "old-refresh-token";
      const mockResponse: TokenResponse = {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      };

      vi.spyOn(client, "apiPost").mockResolvedValue(mockResponse);

      const result = await refreshToken(mockRefreshToken);

      expect(client.apiPost).toHaveBeenCalledWith(
        "/api/auth/refresh",
        { refreshToken: mockRefreshToken },
        { skipAuth: true },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should skip auth when refreshing token", async () => {
      vi.spyOn(client, "apiPost").mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiresIn: 3600,
        tokenType: "Bearer",
      });

      await refreshToken("refresh-token");

      expect(client.apiPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ skipAuth: true }),
      );
    });

    it("should handle refresh token errors", async () => {
      const error = new ApiError(401, "invalid_token", "Refresh token expired");
      vi.spyOn(client, "apiPost").mockRejectedValue(error);

      await expect(refreshToken("expired-token")).rejects.toThrow(ApiError);
      await expect(refreshToken("expired-token")).rejects.toThrow(
        "Refresh token expired",
      );
    });
  });

  describe("getCurrentUser", () => {
    it("should call apiGet with correct endpoint", async () => {
      const mockUser: User = {
        id: "user-123",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        role: "agent",
        status: "active",
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockUser);

      const result = await getCurrentUser();

      expect(client.apiGet).toHaveBeenCalledWith("/api/agents/me");
      expect(result).toEqual(mockUser);
    });

    it("should require authentication", async () => {
      const mockUser: User = {
        id: "user-123",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        role: "agent",
        status: "active",
      };

      vi.spyOn(client, "apiGet").mockResolvedValue(mockUser);

      await getCurrentUser();

      // apiGet should be called without skipAuth option
      expect(client.apiGet).toHaveBeenCalledWith("/api/agents/me");
      expect(client.apiGet).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ skipAuth: true }),
      );
    });

    it("should handle unauthorized errors", async () => {
      const error = new ApiError(401, "unauthorized", "Invalid token");
      vi.spyOn(client, "apiGet").mockRejectedValue(error);

      await expect(getCurrentUser()).rejects.toThrow(ApiError);
      await expect(getCurrentUser()).rejects.toThrow("Invalid token");
    });

    it("should handle network errors", async () => {
      const error = new ApiError(0, "network_error", "Network error occurred");
      vi.spyOn(client, "apiGet").mockRejectedValue(error);

      await expect(getCurrentUser()).rejects.toThrow(ApiError);
      await expect(getCurrentUser()).rejects.toThrow("Network error occurred");
    });
  });
});
