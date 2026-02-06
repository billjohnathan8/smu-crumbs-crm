package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.AccountCreateRequest;
import com.itsa.crm.clients_service.dto.AccountDto;
import com.itsa.crm.clients_service.security.AuthenticatedUser;
import java.util.List;

public interface AccountService {
	AccountDto createAccount(
		AuthenticatedUser user,
		AccountCreateRequest request,
		String authorizationHeader,
		String requestId
	);

	AccountDto getAccount(AuthenticatedUser user, String accountId);

	void deleteAccount(AuthenticatedUser user, String accountId, String authorizationHeader, String requestId);

	List<AccountDto> listAccounts(AuthenticatedUser user, String clientId);
}

