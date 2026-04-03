package com.scroogebank.crm.client_service.service;

import com.scroogebank.crm.client_service.dto.AccountCreateRequest;
import com.scroogebank.crm.client_service.dto.AccountDto;
import com.scroogebank.crm.client_service.dto.AccountListResponse;
import com.scroogebank.crm.client_service.dto.AccountOpeningOptionsDto;
import com.scroogebank.crm.client_service.dto.AccountUpdateRequest;
import com.scroogebank.crm.client_service.security.AuthenticatedUser;

/**
 * Business operations for managing client accounts.
 */
public interface AccountService {
	/**
	 * Creates a new account for a client.
	 *
	 * @param user authenticated user
	 * @param request account creation payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return created account DTO
	 */
	AccountDto createAccount(
		AuthenticatedUser user,
		AccountCreateRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Retrieves a single account visible to the authenticated user.
	 *
	 * @param user authenticated user
	 * @param accountId public account identifier
	 * @return account DTO
	 */
	AccountDto getAccount(AuthenticatedUser user, String accountId);

	/**
	 * Updates an existing account visible to the authenticated user.
	 *
	 * @param user authenticated user
	 * @param accountId public account identifier
	 * @param request update payload
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 * @return updated account DTO
	 */
	AccountDto updateAccount(
		AuthenticatedUser user,
		String accountId,
		AccountUpdateRequest request,
		String authorizationHeader,
		String requestId
	);

	/**
	 * Deletes an account visible to the authenticated user.
	 *
	 * @param user authenticated user
	 * @param accountId public account identifier
	 * @param authorizationHeader bearer token for downstream audit logging
	 * @param requestId request correlation id
	 */
	void deleteAccount(AuthenticatedUser user, String accountId, String authorizationHeader, String requestId);

	/**
	 * Lists accounts for a client visible to the authenticated user with pagination.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @param limit page size
	 * @param offset pagination offset
	 * @return list response with pagination metadata
	 */
	AccountListResponse listAccounts(AuthenticatedUser user, String clientId, int limit, int offset);

	/**
	 * Resolves account opening options for the authenticated caller on a specific client.
	 *
	 * @param user authenticated user
	 * @param clientId public client identifier
	 * @return account opening options
	 */
	AccountOpeningOptionsDto getAccountOpeningOptions(AuthenticatedUser user, String clientId);
}
