package com.scroogebank.crm.client_service.controller;

import com.scroogebank.crm.client_service.dto.AccountCreateRequest;
import com.scroogebank.crm.client_service.dto.AccountDto;
import com.scroogebank.crm.client_service.dto.AccountListResponse;
import com.scroogebank.crm.client_service.dto.AccountOpeningOptionsDto;
import com.scroogebank.crm.client_service.dto.AccountUpdateRequest;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;
import com.scroogebank.crm.client_service.security.RequestAuth;
import com.scroogebank.crm.client_service.service.AccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for account lifecycle operations.
 */
@RestController
@Validated
@Tag(name = "Accounts")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "401", description = "Unauthorized"),
	@ApiResponse(responseCode = "403", description = "Forbidden"),
	@ApiResponse(responseCode = "404", description = "Not found"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
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
	@Operation(summary = "Create account")
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
	@Operation(summary = "Get account by id")
	public AccountDto getAccount(HttpServletRequest httpRequest, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String accountId) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.getAccount(user, accountId);
	}

	@PutMapping("/api/accounts/{accountId}")
	@Operation(summary = "Update account")
	public AccountDto updateAccount(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String accountId,
		@Valid @RequestBody AccountUpdateRequest request
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		return accountService.updateAccount(user, accountId, request, authorizationHeader, requestId(httpRequest));
	}

	@DeleteMapping("/api/accounts/{accountId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Delete account")
	public void deleteAccount(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String accountId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		String authorizationHeader = httpRequest.getHeader("Authorization");
		accountService.deleteAccount(user, accountId, authorizationHeader, requestId(httpRequest));
	}

	@GetMapping("/api/clients/{clientId}/accounts")
	@Operation(summary = "List accounts for client")
	public AccountListResponse listAccounts(
		HttpServletRequest httpRequest,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String clientId,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.listAccounts(user, clientId, limit, offset);
	}

	@GetMapping("/api/account-opening-options")
	@Operation(summary = "Get account opening options")
	public AccountOpeningOptionsDto getAccountOpeningOptions(
		HttpServletRequest httpRequest,
		@RequestParam @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") String clientId
	) {
		AuthenticatedUser user = requestAuth.requireUser(httpRequest);
		return accountService.getAccountOpeningOptions(user, clientId);
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
