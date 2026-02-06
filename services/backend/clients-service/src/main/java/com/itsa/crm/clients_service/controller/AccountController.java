package com.itsa.crm.clients_service.controller;

import com.itsa.crm.clients_service.dto.AccountCreateRequest;
import com.itsa.crm.clients_service.dto.AccountDto;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import com.itsa.crm.clients_service.security.RequestAuth;
import com.itsa.crm.clients_service.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for account lifecycle operations.
 */
@RestController
public class AccountController {
	private final AccountService accountService;
	private final RequestAuth requestAuth;

	public AccountController(AccountService accountService, RequestAuth requestAuth) {
		this.accountService = accountService;
		this.requestAuth = requestAuth;
	}

	/**
	 * Creates an account for a client owned by the authenticated user.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param request account creation payload
	 * @return created account DTO
	 */
	@PostMapping("/api/accounts")
	@ResponseStatus(HttpStatus.CREATED)
	public AccountDto createAccount(
		HttpServletRequest httpRequest,
		@Valid @RequestBody AccountCreateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return accountService.createAccount(user, request, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Returns a single account visible to the authenticated user.
	 *
	 * @param httpRequest HTTP request used for auth
	 * @param accountId public account identifier
	 * @return account DTO
	 */
	@GetMapping("/api/accounts/{accountId}")
	public AccountDto getAccount(HttpServletRequest httpRequest, @PathVariable String accountId) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.getAccount(user, accountId);
	}

	/**
	 * Deletes an account and emits an audit entry when possible.
	 *
	 * @param httpRequest HTTP request used for auth and correlation id extraction
	 * @param accountId public account identifier
	 */
	@DeleteMapping("/api/accounts/{accountId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteAccount(
		HttpServletRequest httpRequest,
		@PathVariable String accountId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		accountService.deleteAccount(user, accountId, authorizationHeader, requestId(httpRequest));
	}

	/**
	 * Lists all accounts for a client visible to the authenticated user.
	 *
	 * @param httpRequest HTTP request used for auth
	 * @param clientId public client identifier
	 * @return list of account DTOs
	 */
	@GetMapping("/api/clients/{clientId}/accounts")
	public List<AccountDto> listAccounts(HttpServletRequest httpRequest, @PathVariable String clientId) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.listAccounts(user, clientId);
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
