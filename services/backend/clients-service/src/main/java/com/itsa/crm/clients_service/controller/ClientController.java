package com.itsa.crm.clients_service.controller;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientListResponse;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.dto.VerifyClientRequest;
import com.itsa.crm.clients_service.dto.VerifyClientResponse;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import com.itsa.crm.clients_service.security.RequestAuth;
import com.itsa.crm.clients_service.service.ClientService;
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

@RestController
@RequestMapping("/api/clients")
public class ClientController {
	private final ClientService clientService;
	private final RequestAuth requestAuth;

	public ClientController(ClientService clientService, RequestAuth requestAuth) {
		this.clientService = clientService;
		this.requestAuth = requestAuth;
	}

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

	@GetMapping("/{id}")
	public ClientDto getClient(HttpServletRequest request, @PathVariable("id") String clientId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		String authorizationHeader = request.getHeader("Authorization");
		return clientService.getClient(user, clientId, authorizationHeader, requestId(request));
	}

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

	private static String requestId(HttpServletRequest request) {
		Object value = request.getAttribute("requestId");
		return value == null ? null : value.toString();
	}
}
