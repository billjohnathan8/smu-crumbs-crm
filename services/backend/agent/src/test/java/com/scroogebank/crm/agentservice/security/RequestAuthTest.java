package com.scroogebank.crm.agentservice.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

/**
 * Unit tests for {@link RequestAuth}.
 */
class RequestAuthTest {
	private JwtService jwtService;
	private RequestAuth requestAuth;

	@BeforeEach
	void setUp() {
		jwtService = mock(JwtService.class);
		requestAuth = new RequestAuth(jwtService);
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

		AuthenticatedUser user = requestAuth.requireUser(request);

		assertEquals("usr_1", user.userId());
		assertEquals("admin", user.role());
	}
}
