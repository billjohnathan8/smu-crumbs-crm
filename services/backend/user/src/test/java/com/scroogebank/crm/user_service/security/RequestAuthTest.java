package com.scroogebank.crm.user_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.service.InMemoryUserStore;
import com.scroogebank.crm.user_service.service.UserStore;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import com.scroogebank.crm.user_service.dto.UserRole;

/**
 * Unit tests for {@link RequestAuth}.
 */
class RequestAuthTest {
	private JwtService jwtService;
	private UserStore userStore;
	private RequestAuth requestAuth;

	@BeforeEach
	void setUp() {
		jwtService = mock(JwtService.class);
		userStore = mock(UserStore.class);
		requestAuth = new RequestAuth(jwtService, userStore);
	}

	@Test
	void requireUser_missingBearer_throwsUnauthorized() {
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn(null);

		assertThrows(UnauthorizedException.class, () -> requestAuth.requireUser(request));
	}

	@Test
	void requireUser_validHeader_parsesToken() {
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer token-value");
		when(jwtService.verifyAndParse("token-value")).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		when(userStore.loadRecord("usr_1")).thenReturn(userRecord(UserStatus.active));

		AuthenticatedUser user = requestAuth.requireUser(request);

		assertEquals("usr_1", user.userId());
		assertEquals(UserRole.admin, user.role());
	}

	@Test
	void requireUser_nonActiveUser_throwsUnauthorized() {
		HttpServletRequest request = mock(HttpServletRequest.class);
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer token-value");
		when(jwtService.verifyAndParse("token-value")).thenReturn(new AuthenticatedUser("usr_1", "admin"));
		when(userStore.loadRecord("usr_1")).thenReturn(userRecord(UserStatus.deleted));

		assertThrows(UnauthorizedException.class, () -> requestAuth.requireUser(request));
	}

	private static InMemoryUserStore.UserRecord userRecord(UserStatus status) {
		return new InMemoryUserStore.UserRecord(
			1L,
			"Root",
			"Admin",
			"root@example.com",
			UserRole.admin,
			status,
			"hash",
			java.time.Instant.parse("2026-02-05T00:00:00Z"),
			java.time.Instant.parse("2026-02-05T00:00:00Z"),
			null,
			null,
			null,
			null,
			null
		);
	}
}
