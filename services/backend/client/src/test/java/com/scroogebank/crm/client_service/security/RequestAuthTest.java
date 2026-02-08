package com.scroogebank.crm.client_service.security;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RequestAuth} bearer token extraction.
 */
class RequestAuthTest {
	@Test
	void requireUser_missingAuthorizationHeader_throwsUnauthorized() {
		JwtService jwtService = mock(JwtService.class);
		RequestAuth requestAuth = new RequestAuth(jwtService);
		MockHttpServletRequest request = new MockHttpServletRequest();

		assertThatThrownBy(() -> requestAuth.requireUser(request))
			.isInstanceOf(UnauthorizedException.class)
			.hasMessage("missing_bearer_token");
	}

	@Test
	void requireUser_wrongScheme_throwsUnauthorized() {
		JwtService jwtService = mock(JwtService.class);
		RequestAuth requestAuth = new RequestAuth(jwtService);
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader(HttpHeaders.AUTHORIZATION, "Basic abc");

		assertThatThrownBy(() -> requestAuth.requireUser(request))
			.isInstanceOf(UnauthorizedException.class)
			.hasMessage("missing_bearer_token");
	}

	@Test
	void requireUser_validBearerToken_callsJwtServiceWithTrimmedToken() {
		JwtService jwtService = mock(JwtService.class);
		RequestAuth requestAuth = new RequestAuth(jwtService);
		HttpServletRequest request = new MockHttpServletRequest();
		((MockHttpServletRequest) request).addHeader(HttpHeaders.AUTHORIZATION, "Bearer token-123   ");
		AuthenticatedUser expected = new AuthenticatedUser("usr_1", "admin");
		when(jwtService.verifyAndParse("token-123")).thenReturn(expected);

		AuthenticatedUser user = requestAuth.requireUser(request);

		assertThat(user).isSameAs(expected);
		verify(jwtService).verifyAndParse("token-123");
	}
}
