package com.itsa.crm.userservice.service;

import com.itsa.crm.userservice.dto.LoginRequest;
import com.itsa.crm.userservice.dto.RefreshRequest;
import com.itsa.crm.userservice.dto.TokenResponse;
import com.itsa.crm.userservice.dto.UserStatus;
import com.itsa.crm.userservice.security.JwtService;
import com.itsa.crm.userservice.security.UnauthorizedException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
	private static final Duration ACCESS_TTL = Duration.ofHours(1);

	private final InMemoryUserStore store;
	private final JwtService jwtService;
	private final Clock clock;

	public AuthService(InMemoryUserStore store, JwtService jwtService, Clock clock) {
		this.store = store;
		this.jwtService = jwtService;
		this.clock = clock;
	}

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
		String role = record.role() == null ? "agent" : record.role().wireValue();
		Instant expiresAt = clock.instant().plus(ACCESS_TTL);
		String access = jwtService.mintAccessToken(userId, role, expiresAt);
		String refresh = store.issueRefreshToken(userId);
		return new TokenResponse(access, refresh, ACCESS_TTL.toSeconds(), "Bearer");
	}

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
		String role = record.role() == null ? "agent" : record.role().wireValue();

		Instant expiresAt = clock.instant().plus(ACCESS_TTL);
		String access = jwtService.mintAccessToken(userId, role, expiresAt);
		return new TokenResponse(access, rotated, ACCESS_TTL.toSeconds(), "Bearer");
	}
}
