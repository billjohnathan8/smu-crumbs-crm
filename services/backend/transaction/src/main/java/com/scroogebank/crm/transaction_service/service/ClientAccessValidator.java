package com.scroogebank.crm.transaction_service.service;

import com.scroogebank.crm.transaction_service.security.AuthenticatedUser;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.UnauthorizedException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Validates that an authenticated user can access a given client.
 */
@Component
public class ClientAccessValidator {
	private final RestClient clientServiceRestClient;

	public ClientAccessValidator(@Qualifier("clientServiceRestClient") RestClient clientServiceRestClient) {
		this.clientServiceRestClient = clientServiceRestClient;
	}

	/**
	 * Ensures the user can access the client by delegating to client-service.
	 */
	public void requireClientAccessible(
		AuthenticatedUser user,
		String authorizationHeader,
		String clientId
	) {
		if (user.isRootAdmin()) {
			return;
		}
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			throw new UnauthorizedException("missing_bearer_token");
		}

		try {
			clientServiceRestClient.get()
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
