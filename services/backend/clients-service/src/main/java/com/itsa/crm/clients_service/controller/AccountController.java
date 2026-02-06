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

@RestController
public class AccountController {
	private final AccountService accountService;
	private final RequestAuth requestAuth;

	public AccountController(AccountService accountService, RequestAuth requestAuth) {
		this.accountService = accountService;
		this.requestAuth = requestAuth;
	}

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

	@GetMapping("/api/accounts/{accountId}")
	public AccountDto getAccount(HttpServletRequest httpRequest, @PathVariable String accountId) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.getAccount(user, accountId);
	}

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

	@GetMapping("/api/clients/{clientId}/accounts")
	public List<AccountDto> listAccounts(HttpServletRequest httpRequest, @PathVariable String clientId) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.listAccounts(user, clientId);
	}

	private static String requestId(HttpServletRequest request) {
		Object value = request.getAttribute("requestId");
		return value == null ? null : value.toString();
	}
}
