package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.ReassignRequest;
import com.scroogebank.crm.client_service.dto.ReassignResponse;
import com.scroogebank.crm.client_service.dto.ReviewVerificationRequest;
import com.scroogebank.crm.client_service.dto.UploadVerificationDocsRequest;
import com.scroogebank.crm.client_service.dto.VerificationDocumentResponse;
import com.scroogebank.crm.client_service.dto.VerificationSubmissionSummaryResponse;
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
	 * @param kycStatus optional KYC status filter
	 * @param assignedUserId optional assigned agent filter (admin only)
	 * @return list response with pagination metadata
	 */
	ClientListResponse listClients(
		AuthenticatedUser user,
		int limit,
		int offset,
		String q,
		com.scroogebank.crm.client_service.dto.IdentityVerificationStatus kycStatus,
		String assignedUserId
	);

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
	 * Reviews a pending client verification as an admin.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param request review action payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return verification response
	 */
	VerifyClientResponse reviewVerification(
		AuthenticatedUser user,
		String clientId,
		ReviewVerificationRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Re-sends a verification email link for a non-verified client.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return verification response with current status
	 */
	VerifyClientResponse resendVerificationLink(
		AuthenticatedUser user,
		String clientId,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Reassigns all clients from one agent to another (admin only).
	 *
	 * @param user authenticated user
	 * @param request reassignment payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return count of reassigned clients
	 */
	ReassignResponse reassignClients(
		AuthenticatedUser user,
		ReassignRequest request,
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

	/**
	 * Lists soft-deleted client records for root admin archive review.
	 */
	ClientListResponse listArchivedClients(
		AuthenticatedUser user,
		int limit,
		int offset,
		String q,
		com.scroogebank.crm.client_service.dto.IdentityVerificationStatus kycStatus,
		String assignedUserId
	);

	/**
	 * Returns aggregate pending verification submission count.
	 */
	VerificationSubmissionSummaryResponse getVerificationSubmissionSummary(AuthenticatedUser user);

	/**
	 * Fetches a stored KYC document for a client visible to the caller.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param documentKind one of {@code primary} or {@code address}
	 * @return document payload including MIME type and base64 content
	 */
	VerificationDocumentResponse getVerificationDocument(
		AuthenticatedUser user,
		String clientId,
		String documentKind
	);

	/**
	 * Counts non-deleted clients assigned to the given agent.
	 *
	 * @param assignedUserId agent identifier
	 * @return count of active clients
	 */
	long countClientsByAgent(AuthenticatedUser user, String assignedUserId);
}
