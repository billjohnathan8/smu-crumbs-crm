package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.UploadVerificationDocsRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;

/**
 * Business operations for managing clients.
 */
public interface ClientService {
	/**
	 * Lists clients visible to the authenticated user.
	 *
	 * @param user authenticated user
	 * @param limit page size (capped by service)
	 * @param offset pagination offset
	 * @param q optional search query
	 * @return list response with pagination metadata
	 */
	ClientListResponse listClients(AuthenticatedUser user, int limit, int offset, String q);

	/**
	 * Retrieves a client by id and emits a read audit entry when possible.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return client DTO
	 */
	ClientDto getClient(AuthenticatedUser user, String clientId, String authorizationHeader, String requestId);

	/**
	 * Creates a new client.
	 *
	 * @param user authenticated user
	 * @param request create payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return created client DTO
	 */
	ClientDto createClient(
		AuthenticatedUser user,
		ClientCreateRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Updates an existing client.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param request update payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return updated client DTO
	 */
	ClientDto updateClient(
		AuthenticatedUser user,
		String clientId,
		ClientUpdateRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Deletes a client.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 */
	void deleteClient(AuthenticatedUser user, String clientId, String authorizationHeader, String requestId);

	/**
	 * Verifies a client identity document and updates verification status.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param request verification payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return verification response
	 */
	VerifyClientResponse verifyClient(
		AuthenticatedUser user,
		String clientId,
		VerifyClientRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * 
	 */
	VerifyClientResponse uploadVerificationDocs(
		String clientId,
		UploadVerificationDocsRequest request,
		String requestId
	);
}
