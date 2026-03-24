package com.scroogebank.crm.client_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContextHolder;

class JwtAuthFilterTest {

	private JwtService jwtService;
	private JwtAuthFilter filter;
	private HttpServletRequest request;
	private HttpServletResponse response;
	private FilterChain filterChain;

	@BeforeEach
	void setUp() {
		jwtService = mock(JwtService.class);
		filter = new JwtAuthFilter(jwtService);
		request = mock(HttpServletRequest.class);
		response = mock(HttpServletResponse.class);
		filterChain = mock(FilterChain.class);
		SecurityContextHolder.clearContext();
	}

	@AfterEach
	void tearDown() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void validBearerToken_setsSecurityContext() throws Exception {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "admin");
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer valid-token");
		when(jwtService.verifyAndParse("valid-token")).thenReturn(user);

		filter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		var auth = SecurityContextHolder.getContext().getAuthentication();
		assertEquals(user, auth.getPrincipal());
	}

	@Test
	void invalidToken_leavesContextEmpty() throws Exception {
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer bad-token");
		when(jwtService.verifyAndParse("bad-token")).thenThrow(new JwtValidationException("invalid"));

		filter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}

	@Test
	void noAuthorizationHeader_leavesContextEmpty() throws Exception {
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn(null);

		filter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}

	@Test
	void nonBearerHeader_leavesContextEmpty() throws Exception {
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Basic abc123");

		filter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}
}
