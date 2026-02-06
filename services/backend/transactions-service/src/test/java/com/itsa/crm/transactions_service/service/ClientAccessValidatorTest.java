package com.itsa.crm.transactions_service.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.itsa.crm.transactions_service.security.AuthenticatedUser;
import com.itsa.crm.transactions_service.security.ForbiddenException;
import com.itsa.crm.transactions_service.security.UnauthorizedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;

class ClientAccessValidatorTest {
	private RestClient restClient;
	private RestClient.RequestHeadersUriSpec<?> uriSpec;
	private RestClient.RequestHeadersSpec<?> headersSpec;
	private RestClient.ResponseSpec responseSpec;
	private ClientAccessValidator validator;

	@BeforeEach
	void setUp() {
		restClient = mock(RestClient.class);
		uriSpec = mockRequestHeadersUriSpec();
		headersSpec = mockRequestHeadersSpec();
		responseSpec = mock(RestClient.ResponseSpec.class);
		validator = new ClientAccessValidator(restClient);
	}

	@SuppressWarnings({ "rawtypes" })
	private static RestClient.RequestHeadersUriSpec<?> mockRequestHeadersUriSpec() {
		return (RestClient.RequestHeadersUriSpec) mock(RestClient.RequestHeadersUriSpec.class);
	}

	@SuppressWarnings({ "rawtypes" })
	private static RestClient.RequestHeadersSpec<?> mockRequestHeadersSpec() {
		return (RestClient.RequestHeadersSpec) mock(RestClient.RequestHeadersSpec.class);
	}

	@Test
	void requireClientAccessible_adminBypassesRemoteCheck() {
		validator.requireClientAccessible(new AuthenticatedUser("usr_admin", "admin"), null, "clt_1");

		verify(restClient, never()).get();
	}

	@Test
	void requireClientAccessible_missingAuthorizationHeader_throwsUnauthorized() {
		assertThrows(UnauthorizedException.class, () ->
			validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), " ", "clt_1")
		);

		verify(restClient, never()).get();
	}

	@Test
	void requireClientAccessible_nullAuthorizationHeader_throwsUnauthorized() {
		assertThrows(UnauthorizedException.class, () ->
			validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), null, "clt_1")
		);

		verify(restClient, never()).get();
	}

	@Test
	void requireClientAccessible_successfulLookup_allowsAccess() {
		doReturn(uriSpec).when(restClient).get();
		doReturn(headersSpec).when(uriSpec).uri("/api/clients/{clientId}", "clt_1");
		doReturn(headersSpec).when(headersSpec).header(HttpHeaders.AUTHORIZATION, "Bearer x");
		doReturn(responseSpec).when(headersSpec).retrieve();

		validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), "Bearer x", "clt_1");

		verify(responseSpec).toBodilessEntity();
	}

	@Test
	void requireClientAccessible_remote404_throwsForbidden() {
		doReturn(uriSpec).when(restClient).get();
		doReturn(headersSpec).when(uriSpec).uri("/api/clients/{clientId}", "clt_1");
		doReturn(headersSpec).when(headersSpec).header(HttpHeaders.AUTHORIZATION, "Bearer x");
		doReturn(responseSpec).when(headersSpec).retrieve();
		when(responseSpec.toBodilessEntity()).thenThrow(
			HttpClientErrorException.create(HttpStatus.NOT_FOUND, "missing", HttpHeaders.EMPTY, null, null)
		);

		assertThrows(ForbiddenException.class, () ->
			validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), "Bearer x", "clt_1")
		);
	}

	@Test
	void requireClientAccessible_remote401_throwsUnauthorized() {
		doReturn(uriSpec).when(restClient).get();
		doReturn(headersSpec).when(uriSpec).uri("/api/clients/{clientId}", "clt_1");
		doReturn(headersSpec).when(headersSpec).header(HttpHeaders.AUTHORIZATION, "Bearer x");
		doReturn(responseSpec).when(headersSpec).retrieve();
		when(responseSpec.toBodilessEntity()).thenThrow(
			HttpClientErrorException.create(HttpStatus.UNAUTHORIZED, "unauthorized", HttpHeaders.EMPTY, null, null)
		);

		assertThrows(UnauthorizedException.class, () ->
			validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), "Bearer x", "clt_1")
		);
	}

	@Test
	void requireClientAccessible_otherRemoteError_throwsForbidden() {
		doReturn(uriSpec).when(restClient).get();
		doReturn(headersSpec).when(uriSpec).uri("/api/clients/{clientId}", "clt_1");
		doReturn(headersSpec).when(headersSpec).header(HttpHeaders.AUTHORIZATION, "Bearer x");
		doReturn(responseSpec).when(headersSpec).retrieve();
		when(responseSpec.toBodilessEntity()).thenThrow(
			HttpServerErrorException.create(HttpStatus.BAD_GATEWAY, "upstream", HttpHeaders.EMPTY, null, null)
		);

		assertThrows(ForbiddenException.class, () ->
			validator.requireClientAccessible(new AuthenticatedUser("usr_1", "agent"), "Bearer x", "clt_1")
		);
	}
}
