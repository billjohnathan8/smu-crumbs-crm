package com.itsa.crm.agentservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.itsa.crm.agentservice.dto.LoginRequest;
import com.itsa.crm.agentservice.dto.RefreshRequest;
import com.itsa.crm.agentservice.dto.TokenResponse;
import com.itsa.crm.agentservice.dto.UserRole;
import com.itsa.crm.agentservice.dto.UserStatus;
import com.itsa.crm.agentservice.security.JwtService;
import com.itsa.crm.agentservice.security.UnauthorizedException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link AuthService}.
 */
class AuthServiceTest {
	private InMemoryUserStore store;
	private JwtService jwtService;
	private AuthService authService;

	@BeforeEach
	void setUp() {
		store = mock(InMemoryUserStore.class);
		jwtService = mock(JwtService.class);
		authService = new AuthService(
			store,
			jwtService,
			Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC)
		);
	}

	@Test
	void login_unknownUser_throwsUnauthorized() {
		when(store.findByEmail("ava@example.com")).thenReturn(null);

		assertThrows(UnauthorizedException.class, () -> authService.login(
			new LoginRequest("ava@example.com", "pw")
		));
	}

	@Test
	void login_disabledUser_throwsUnauthorized() {
		when(store.findByEmail("ava@example.com")).thenReturn(userRecord(2L, UserRole.agent, UserStatus.disabled));

		assertThrows(UnauthorizedException.class, () -> authService.login(
			new LoginRequest("ava@example.com", "pw")
		));
	}

	@Test
	void login_wrongPassword_throwsUnauthorized() {
		InMemoryUserStore.UserRecord record = userRecord(2L, UserRole.agent, UserStatus.active);
		when(store.findByEmail("ava@example.com")).thenReturn(record);
		when(store.verifyPassword(record, "wrong")).thenReturn(false);

		assertThrows(UnauthorizedException.class, () -> authService.login(
			new LoginRequest("ava@example.com", "wrong")
		));
	}

	@Test
	void login_successDefaultsNullRoleToAgent() {
		InMemoryUserStore.UserRecord record = userRecord(2L, null, UserStatus.active);
		when(store.findByEmail("ava@example.com")).thenReturn(record);
		when(store.verifyPassword(record, "pw")).thenReturn(true);
		when(store.issueRefreshToken("usr_2")).thenReturn("refresh-1");
		when(jwtService.mintAccessToken(eq("usr_2"), eq("agent"), any())).thenReturn("access-1");

		TokenResponse response = authService.login(new LoginRequest("ava@example.com", "pw"));

		assertEquals("access-1", response.accessToken());
		assertEquals("refresh-1", response.refreshToken());
		assertEquals(3600, response.expiresIn());
		assertEquals("Bearer", response.tokenType());
		verify(jwtService).mintAccessToken(eq("usr_2"), eq("agent"), any());
	}

	@Test
	void refresh_invalidToken_throwsUnauthorized() {
		when(store.isRefreshTokenValid("bad")).thenReturn(false);

		assertThrows(UnauthorizedException.class, () -> authService.refresh(new RefreshRequest("bad")));
	}

	@Test
	void refresh_validButUnknownUser_throwsUnauthorized() {
		when(store.isRefreshTokenValid("old")).thenReturn(true);
		when(store.userIdForRefreshToken("old")).thenReturn("usr_77");
		when(store.rotateRefreshToken("old")).thenReturn("new");
		when(store.loadRecord("usr_77")).thenThrow(new RuntimeException("missing"));

		assertThrows(UnauthorizedException.class, () -> authService.refresh(new RefreshRequest("old")));
	}

	@Test
	void refresh_successReturnsRotatedToken() {
		when(store.isRefreshTokenValid("old")).thenReturn(true);
		when(store.userIdForRefreshToken("old")).thenReturn("usr_2");
		when(store.rotateRefreshToken("old")).thenReturn("new");
		when(store.loadRecord("usr_2")).thenReturn(userRecord(2L, UserRole.admin, UserStatus.active));
		when(jwtService.mintAccessToken(eq("usr_2"), eq("admin"), any())).thenReturn("access-2");

		TokenResponse response = authService.refresh(new RefreshRequest("old"));

		assertEquals("access-2", response.accessToken());
		assertEquals("new", response.refreshToken());
		assertEquals("Bearer", response.tokenType());
	}

	private static InMemoryUserStore.UserRecord userRecord(long id, UserRole role, UserStatus status) {
		Instant now = Instant.parse("2026-02-05T00:00:00Z");
		return new InMemoryUserStore.UserRecord(
			id,
			"Ava",
			"Stone",
			"ava@example.com",
			role,
			status,
			"hash",
			now,
			now
		);
	}
}
