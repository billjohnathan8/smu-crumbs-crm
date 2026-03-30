package com.scroogebank.crm.client_service.controller;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.ReviewVerificationRequest;
import com.scroogebank.crm.client_service.dto.UploadVerificationDocsRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.service.ClientService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for client lifecycle and verification operations.
 */
@RestController
@Validated
@RequestMapping("/api/clients")
@Tag(name = "Clients")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "401", description = "Unauthorized"),
	@ApiResponse(responseCode = "403", description = "Forbidden"),
	@ApiResponse(responseCode = "404", description = "Not found"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
public class ClientController {
	private final ClientService clientService;
	private final RequestAuth requestAuth;

	public ClientController(ClientService clientService, RequestAuth requestAuth) {
		this.clientService = clientService;
		this.requestAuth = requestAuth;
	}

	/**
	 * Lists clients visible to the authenticated user with pagination and optional query filtering.
	 *
	 * @param request HTTP request used for auth
	 * @param limit page size (capped by service)
	 * @param offset pagination offset
	 * @param q optional search query
	 * @return list response with pagination metadata
	 */
	@GetMapping
	@Operation(summary = "List clients")
	public ClientListResponse listClients(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset,
		@RequestParam(required = false) String q
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return clientService.listClients(user, limit, offset, q);
	}

	/**
	 * Creates a new client and returns the created record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param request create payload
	 * @return created client DTO
	 */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Create client")
	public ClientDto createClient(
		HttpServletRequest httpRequest,
		@Valid @RequestBody ClientCreateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.createClient(user, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Fetches a single client and emits a read audit entry when possible.
	 *
	 * @param request HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @return client DTO
	 */
	@GetMapping("/{id}")
	@Operation(summary = "Get client by id")
	public ClientDto getClient(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		String authorizationHeader = request.getHeader("Authorization");
		return clientService.getClient(user, clientId, authorizationHeader, requestId(request));
	}

	/**
	 * Updates an existing client record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request update payload (partial updates allowed)
	 * @return updated client DTO
	 */
	@PutMapping("/{id}")
	@Operation(summary = "Update client")
	public ClientDto updateClient(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Valid @RequestBody ClientUpdateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.updateClient(user, clientId, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Deletes a client record.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Delete client")
	public void deleteClient(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		clientService.deleteClient(user, clientId, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Client upload verification document
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request verification payload
	 * @return verification response
	 */
	@PostMapping("/{id}/upload-verify")
	@Operation(summary = "Upload client verification documents with verification token")
	@SecurityRequirements
	public VerifyClientResponse uploadVerificationDocs(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Valid @RequestBody UploadVerificationDocsRequest request
	) {
		return clientService.uploadVerificationDocs(clientId, request, requestId(httpRequest));
	}

	/**
	 * Reviews a pending verification request (admin only).
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request review action payload
	 * @return verification response
	 */
	@PatchMapping("/{id}/verify/review")
	@Operation(summary = "Review client verification")
	public VerifyClientResponse reviewVerification(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable("id") String clientId,
		@Valid @RequestBody ReviewVerificationRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.reviewVerification(user, clientId, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Pulls the request id from attributes to correlate downstream audit logs.
	 *
	 * @param request HTTP request
	 * @return request id or null when missing
	 */
	private static String requestId(HttpServletRequest request) {
		Object value = request.getAttribute("requestId");
		return value == null ? null : value.toString();
	}
}
