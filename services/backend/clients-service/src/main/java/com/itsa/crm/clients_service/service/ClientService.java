package com.itsa.crm.clients_service.service;

import com.itsa.crm.clients_service.dto.ClientCreateRequest;
import com.itsa.crm.clients_service.dto.ClientDto;
import com.itsa.crm.clients_service.dto.ClientListResponse;
import com.itsa.crm.clients_service.dto.ClientUpdateRequest;
import com.itsa.crm.clients_service.dto.VerifyClientRequest;
import com.itsa.crm.clients_service.dto.VerifyClientResponse;
import com.itsa.crm.clients_service.security.AuthenticatedUser;

public interface ClientService {
	ClientListResponse listClients(AuthenticatedUser user, int limit, int offset, String q);

	ClientDto getClient(AuthenticatedUser user, String clientId, String authorizationHeader, String requestId);

	ClientDto createClient(
		AuthenticatedUser user,
		ClientCreateRequest request,
		String authorizationHeader,
		String requestId
	);

	ClientDto updateClient(
		AuthenticatedUser user,
		String clientId,
		ClientUpdateRequest request,
		String authorizationHeader,
		String requestId
	);

	void deleteClient(AuthenticatedUser user, String clientId, String authorizationHeader, String requestId);

	VerifyClientResponse verifyClient(
		AuthenticatedUser user,
		String clientId,
		VerifyClientRequest request,
		String authorizationHeader,
		String requestId
	);
}
