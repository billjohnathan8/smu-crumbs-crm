package com.scroogebank.crm.client_service.controller;

import com.scroogebank.crm.client_service.dto.ClientCreateRequest;
import com.scroogebank.crm.client_service.dto.ClientDto;
import com.scroogebank.crm.client_service.dto.ClientListResponse;
import com.scroogebank.crm.client_service.dto.ClientUpdateRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientRequest;
import com.scroogebank.crm.client_service.dto.VerifyClientResponse;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.service.ClientService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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
@RequestMapping("/api/clients")
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
	public ClientDto getClient(HttpServletRequest request, @PathVariable("id") String clientId) {
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
	public ClientDto updateClient(
		HttpServletRequest httpRequest,
		@PathVariable("id") String clientId,
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
	public void deleteClient(
		HttpServletRequest httpRequest,
		@PathVariable("id") String clientId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		clientService.deleteClient(user, clientId, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Marks a client's identity verification status as verified.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param clientId public client identifier
	 * @param request verification payload
	 * @return verification response
	 */
	@PostMapping("/{id}/verify")
	public VerifyClientResponse verifyClient(
		HttpServletRequest httpRequest,
		@PathVariable("id") String clientId,
		@Valid @RequestBody VerifyClientRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return clientService.verifyClient(user, clientId, request, authorizationHeader, requestId(httpRequest));
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
