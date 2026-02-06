package com.itsa.crm.transactions_service.service;

import com.itsa.crm.transactions_service.security.AuthenticatedUser;
import com.itsa.crm.transactions_service.security.ForbiddenException;
import com.itsa.crm.transactions_service.security.UnauthorizedException;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Validates that an authenticated user can access a given client.
 */
@Component
public class ClientAccessValidator {
	private final RestClient clientsServiceRestClient;

	public ClientAccessValidator(RestClient clientsServiceRestClient) {
		this.clientsServiceRestClient = clientsServiceRestClient;
	}

	/**
	 * Ensures the user can access the client by delegating to clients-service.
	 */
	public void requireClientAccessible(
		AuthenticatedUser user,
		String authorizationHeader,
		String clientId
	) {
		if (user.isAdmin()) {
			return;
		}
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			throw new UnauthorizedException("missing_bearer_token");
		}

		try {
			clientsServiceRestClient.get()
				.uri("/api/clients/{clientId}", clientId)
				.header(HttpHeaders.AUTHORIZATION, authorizationHeader)
				.retrieve()
				.toBodilessEntity();
			return;
		}
		catch (RestClientResponseException ex) {
			int statusCode = ex.getStatusCode().value();
			if (statusCode == 404) {
				throw new ForbiddenException("forbidden");
			}
			if (statusCode == 401) {
				throw new UnauthorizedException("unauthorized");
			}
			throw new ForbiddenException("forbidden");
		}
	}
}
