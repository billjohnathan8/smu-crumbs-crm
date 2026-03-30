package com.scroogebank.crm.transaction_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
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

	@Test
	void expiredToken_leavesContextEmpty() throws Exception {
		JwtService realJwtService = new JwtService(
			new ObjectMapper(),
			Clock.fixed(Instant.parse("2026-03-30T00:00:00Z"), ZoneOffset.UTC),
			"test-secret"
		);
		JwtAuthFilter realFilter = new JwtAuthFilter(realJwtService);
		String token = realJwtService.mintAccessToken("usr_1", "admin", Instant.parse("2026-03-29T23:59:59Z"));
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer " + token);

		realFilter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}

	@Test
	void tamperedPayloadRoleEscalation_leavesContextEmpty() throws Exception {
		JwtService realJwtService = new JwtService(
			new ObjectMapper(),
			Clock.fixed(Instant.parse("2026-03-30T00:00:00Z"), ZoneOffset.UTC),
			"test-secret"
		);
		JwtAuthFilter realFilter = new JwtAuthFilter(realJwtService);
		String validToken = realJwtService.mintAccessToken("usr_1", "user", Instant.parse("2026-03-30T01:00:00Z"));
		String tamperedToken = tamperRoleWithoutResigning(validToken, "user", "admin");
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer " + tamperedToken);

		realFilter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}

	@Test
	void algNoneToken_leavesContextEmpty() throws Exception {
		JwtService realJwtService = new JwtService(
			new ObjectMapper(),
			Clock.fixed(Instant.parse("2026-03-30T00:00:00Z"), ZoneOffset.UTC),
			"test-secret"
		);
		JwtAuthFilter realFilter = new JwtAuthFilter(realJwtService);
		String header = Base64.getUrlEncoder().withoutPadding()
			.encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
		String payload = Base64.getUrlEncoder().withoutPadding()
			.encodeToString("{\"sub\":\"usr_1\",\"role\":\"admin\"}".getBytes(StandardCharsets.UTF_8));
		when(request.getHeader(HttpHeaders.AUTHORIZATION)).thenReturn("Bearer " + header + "." + payload + ".ignored");

		realFilter.doFilterInternal(request, response, filterChain);

		verify(filterChain).doFilter(request, response);
		assertNull(SecurityContextHolder.getContext().getAuthentication());
	}

	private static String tamperRoleWithoutResigning(String token, String fromRole, String toRole) {
		String[] parts = token.split("\\.");
		String payloadJson = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
		String tamperedPayload = payloadJson.replace("\"role\":\"" + fromRole + "\"", "\"role\":\"" + toRole + "\"");
		String tamperedPayloadPart = Base64.getUrlEncoder().withoutPadding()
			.encodeToString(tamperedPayload.getBytes(StandardCharsets.UTF_8));
		return parts[0] + "." + tamperedPayloadPart + "." + parts[2];
	}
}
