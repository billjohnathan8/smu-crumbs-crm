package com.scroogebank.crm.user_service.service;

import com.scroogebank.crm.user_service.dto.LoginRequest;
import com.scroogebank.crm.user_service.dto.PerformResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.RefreshRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.TokenResponse;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.security.JwtService;
import com.scroogebank.crm.user_service.security.UnauthorizedException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;

/**
 * Core authentication workflows for login and token refresh.
 */
@Service
public class AuthService {
	private static final Duration ACCESS_TTL = Duration.ofHours(1);

	private final UserStore store;
	private final JwtService jwtService;
	private final Clock clock;

	public AuthService(UserStore store, JwtService jwtService, Clock clock) {
		this.store = store;
		this.jwtService = jwtService;
		this.clock = clock;
	}

	/**
	 * Verifies credentials, issues a new access token, and creates a refresh token.
	 *
	 * @param request login request
	 * @return token response
	 * @throws UnauthorizedException when credentials are invalid
	 */
	public TokenResponse login(LoginRequest request) {
		InMemoryUserStore.UserRecord record = store.findByEmail(request.email());
		if (record == null) {
			throw new UnauthorizedException("invalid_credentials");
		}
		if (record.status() == UserStatus.disabled) {
			throw new UnauthorizedException("invalid_credentials");
		}
		if (!store.verifyPassword(record, request.password())) {
			throw new UnauthorizedException("invalid_credentials");
		}

		String userId = "usr_" + record.id();
		String role = record.role() == null ? "user" : record.role().wireValue();
		Instant expiresAt = clock.instant().plus(ACCESS_TTL);
		String access = jwtService.mintAccessToken(userId, role, expiresAt);
		String refresh = store.issueRefreshToken(userId);
		return new TokenResponse(access, refresh, ACCESS_TTL.toSeconds(), "Bearer");
	}

	/**
	 * Initiates a password reset flow by creating a reset token.
	 * Always returns successfully to avoid leaking whether the email exists.
	 *
	 * @param request forgot password request containing the email
	 */
	public void forgotPassword(ResetPasswordRequest request) {
		store.createPasswordResetToken(request.email());
	}

	/**
	 * Resets a user's password using a valid reset token.
	 *
	 * @param request reset request with token and new password
	 * @throws IllegalArgumentException when passwords don't match or token is invalid
	 */
	public void performResetPassword(PerformResetPasswordRequest request) {
		if (!request.newPassword().equals(request.confirmPassword())) {
			throw new IllegalArgumentException("passwords_do_not_match");
		}
		store.resetPasswordWithToken(request.token(), request.newPassword());
	}

	/**
	 * Rotates a refresh token and returns a new access token.
	 *
	 * @param request refresh token request
	 * @return token response
	 * @throws UnauthorizedException when the refresh token is invalid
	 */
	public TokenResponse refresh(RefreshRequest request) {
		String old = request.refreshToken();
		if (!store.isRefreshTokenValid(old)) {
			throw new UnauthorizedException("invalid_refresh_token");
		}
		String userId = store.userIdForRefreshToken(old);
		if (userId == null) {
			throw new UnauthorizedException("invalid_refresh_token");
		}

		String rotated = store.rotateRefreshToken(old);
		if (rotated == null) {
			throw new UnauthorizedException("invalid_refresh_token");
		}

		InMemoryUserStore.UserRecord record;
		try {
			record = store.loadRecord(userId);
		}
		catch (RuntimeException ex) {
			throw new UnauthorizedException("invalid_refresh_token");
		}
		String role = record.role() == null ? "user" : record.role().wireValue();

		Instant expiresAt = clock.instant().plus(ACCESS_TTL);
		String access = jwtService.mintAccessToken(userId, role, expiresAt);
		return new TokenResponse(access, rotated, ACCESS_TTL.toSeconds(), "Bearer");
	}
}
